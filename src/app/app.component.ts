import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { AuditEntry, AreaSection, PazRequest, QuestionOption, RequestStatus, UserAccountView } from './models';
import { NewRequest, NewUser, PazSalvoApiService } from './paz-salvo-api.service';
import { AuthService, LoginCommand } from './auth.service';

const AREA_LABELS: Record<string, string> = {
  DIRECCION_UNIDAD: 'Dirección / unidad',
  GESTION_ADMINISTRATIVA: 'Gestión administrativa',
  TIC: 'Tecnologías de la información',
  GESTION_FINANCIERA: 'Gestión financiera',
  SEGURIDAD_INFORMACION: 'Seguridad de la información',
  RECURSOS_HUMANOS: 'Recursos humanos',
  RECEPCION_DOCUMENTOS: 'Recepción de documentos'
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  readonly api = inject(PazSalvoApiService);
  readonly auth = inject(AuthService);

  readonly requests = signal<PazRequest[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly areaFilter = signal('TODAS');
  readonly searchText = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showCreate = signal(false);
  readonly showAudit = signal(false);
  readonly showUsers = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly finalObservation = signal('');
  readonly finalStatus = signal<'APROBADO' | 'NEGADO'>('APROBADO');
  readonly signerName = signal('Responsable de área');
  readonly signerEmail = signal('responsable@institucion.gob.ec');
  readonly users = signal<UserAccountView[]>([]);
  readonly editingUser = signal<UserAccountView | null>(null);
  readonly profileEditingUser = signal<UserAccountView | null>(null);
  editUsername = '';
  editFullName = '';
  editEmail = '';
  editWorkUnit = '';
  editAccountType: 'DIRECTOR_UNIDAD' | 'RESPONSABLE_AREA' = 'RESPONSABLE_AREA';
  editAccountArea = '';
  readonly questionOptions = signal<QuestionOption[]>([]);
  readonly loginError = signal('');
  readonly credentials = signal<{ title: string; username: string; password: string } | null>(null);
  readonly showLoginPassword = signal(false);
  readonly showNewUserPassword = signal(false);
  readonly showCredentialPassword = signal(false);
  readonly showTrackingPassword = signal(false);
  readonly resettingPasswordUser = signal<UserAccountView | null>(null);
  readonly showResetPassword = signal(false);
  resetPasswordValue = '';

  fullName = '';
  identification = '';
  email = '';
  secondaryEmail = '';
  jobTitle = '';
  workUnit = '';
  employmentType = '';
  startDate = '';
  departureDate = '';
  homeAddress = '';
  homePhone = '';
  province = '';
  mobilePhone = '';
  canton = '';
  emergencyContact = '';
  workplace = '';
  occupationalGroup = '';
  directionResponsibleId = '';
  customQuestionArea = '';
  customQuestionLabel = '';
  trackingUsername = '';
  trackingPassword = '';
  loginUsername = '';
  loginPassword = '';
  newUserUsername = '';
  newUserFullName = '';
  newUserEmail = '';
  newUserPassword = '';
  newUserRole: 'TALENTO_HUMANO' | 'RESPONSABLE_AREA' | 'DIRECTOR_UNIDAD' = 'RESPONSABLE_AREA';
  newUserArea = '';
  newUserWorkUnit = '';
  newDirectorUnitChoice = '';
  editDirectorUnitChoice = '';
  newUserQuestionKeys: string[] = [];
  auditEntries: AuditEntry[] = [];
  readonly areaNames = AREA_LABELS;
  readonly directorAreaOptions = Object.entries(AREA_LABELS)
    .filter(([key]) => key !== 'DIRECCION_UNIDAD')
    .map(([, label]) => label);
  readonly employmentTypes = ['Nombramiento permanente', 'Nombramiento provisional', 'Contrato ocasional', 'Contrato de trabajo'];
  readonly workplaceTypes = ['Planta central', 'Procesos desconcentrados'];
  readonly unassignedQuestionLabels = signal<string[]>([]);
  readonly checkingQuestionAssignments = signal(false);

  readonly selectedRequest = computed(() =>
    this.requests().find(request => request.id === this.selectedId()) ?? null
  );

  readonly filteredRequests = computed(() => {
    const filter = this.areaFilter();
    const term = this.searchText().trim().toLocaleLowerCase();
    return this.requests().filter(request => {
      const active = request.sections.find(section => section.status === 'EN_CURSO');
      const matchesArea = !this.auth.isHumanResources() || filter === 'TODAS'
        || (filter === 'FINAL' && !active)
        || active?.area === filter;
      const searchable = `${request.fullName} ${request.identification}`.toLocaleLowerCase();
      return matchesArea && (!term || searchable.includes(term));
    });
  });

  get activeSection(): AreaSection | null {
    return this.selectedRequest()?.sections.find(section => section.status === 'EN_CURSO') ?? null;
  }

  hasUnsignedAnswers(section: AreaSection): boolean {
    return section.answers.some(answer => !answer.signedAt);
  }

  hasSavedWorkDetails(request: PazRequest): boolean {
    return !!request.workplace?.trim() && !!request.occupationalGroup?.trim()
      && !!request.workUnit?.trim() && !!request.jobTitle?.trim();
  }

  get completedSections(): number {
    return this.selectedRequest()?.sections.filter(section => section.status === 'COMPLETADA').length ?? 0;
  }

  get progressPercent(): number {
    const request = this.selectedRequest();
    if (!request) return 0;
    const complete = request.sections.filter(section => section.status === 'COMPLETADA').length;
    return Math.round((complete / request.sections.length) * 100);
  }

  countByStatus(status: RequestStatus): number {
    return this.requests().filter(request => request.status === status).length;
  }

  activeAreaLabel(request: PazRequest): string {
    const active = request.sections.find(section => section.status === 'EN_CURSO');
    if (active) return this.areaName(active.area);
    const assigned = request.sections[0];
    return assigned ? this.areaName(assigned.area) : this.statusLabel(request.status);
  }

  hasCompletedSections(request: PazRequest): boolean {
    return request.sections.some(section => section.status === 'COMPLETADA');
  }

  sectionSigners(section: AreaSection): string {
    return [...new Set(section.answers.map(answer => answer.signerName).filter(Boolean))].join(', ');
  }

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      this.loadRequests();
    }
  }

  login(): void {
    const command: LoginCommand = {
      username: this.loginUsername.trim(),
      password: this.loginPassword
    };
    this.saving.set(true);
    this.loginError.set('');
    this.auth.login(command).subscribe({
      next: () => {
        this.saving.set(false);
        this.loginPassword = '';
        this.loadRequests();
        if (this.auth.isHumanResources()) {
          this.loadUsers();
        }
      },
      error: error => {
        this.saving.set(false);
        const response = error as HttpErrorResponse;
        this.loginError.set(response.error?.detail ?? 'Usuario o contraseña incorrectos.');
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.requests.set([]);
    this.selectedId.set(null);
    this.showUsers.set(false);
  }

  downloadReport(): void {
    this.api.exportReport().subscribe({
      next: blob => this.saveBlob(blob, 'reporte-paz-y-salvo.csv'),
      error: error => this.showError(error)
    });
  }

  downloadSignedDocument(): void {
    const request = this.selectedRequest();
    if (!request) return;
    this.api.downloadSignedDocument(request.id).subscribe({
      next: blob => this.saveBlob(blob, `paz-y-salvo-${request.id}.pdf`),
      error: error => this.showError(error)
    });
  }

  downloadSignedSection(section: AreaSection, userId: number): void {
    const request = this.selectedRequest();
    if (!request) return;
    this.api.downloadSignedSection(request.id, section.id, userId).subscribe({
      next: blob => this.saveBlob(blob, `apartado-${section.area}-${request.id}-${userId}.pdf`),
      error: error => { void this.showBlobError(error); }
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  loadRequests(selectId?: number): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: requests => {
        this.requests.set(requests);
        this.errorMessage.set('');
        const nextId = selectId ?? this.selectedId() ?? requests[0]?.id ?? null;
        this.selectedId.set(requests.some(request => request.id === nextId) ? nextId : null);
        this.loading.set(false);
      },
      error: error => {
        this.loading.set(false);
        this.showError(error);
      }
    });
  }

  selectRequest(request: PazRequest): void {
    this.selectedId.set(request.id);
    this.clearNotices();
  }

  openUsers(): void {
    this.clearNotices();
    this.editingUser.set(null);
    this.loadUsers(() => this.showUsers.set(true));
  }

  private loadUsers(onLoaded?: () => void): void {
    this.api.listUsers().subscribe({
      next: list => {
        this.users.set(list);
        onLoaded?.();
      },
      error: error => this.showError(error)
    });
  }

  createUser(): void {
    const command: NewUser = {
      username: this.newUserUsername.trim(),
      fullName: this.newUserFullName.trim(),
      email: this.newUserEmail.trim(),
      password: this.newUserPassword,
      role: this.newUserRole === 'TALENTO_HUMANO' ? 'TALENTO_HUMANO' : 'RESPONSABLE_AREA',
      area: this.newUserRole === 'DIRECTOR_UNIDAD' ? 'DIRECCION_UNIDAD'
        : this.newUserRole === 'RESPONSABLE_AREA' ? this.newUserArea : null,
      workUnit: this.newUserRole === 'DIRECTOR_UNIDAD' || (this.newUserRole === 'RESPONSABLE_AREA' && this.newUserArea === 'DIRECCION_UNIDAD')
        ? this.newUserWorkUnit.trim() : null,
      questionKeys: this.newUserRole === 'RESPONSABLE_AREA' ? this.newUserQuestionKeys : []
    };
    this.saving.set(true);
    this.api.createUser(command).subscribe({
      next: user => {
        this.saving.set(false);
        this.users.update(items => [...items, user].sort((a, b) => a.fullName.localeCompare(b.fullName)));
        this.newUserUsername = '';
        this.newUserFullName = '';
        this.newUserEmail = '';
        this.newUserPassword = '';
        this.newUserArea = '';
        this.newUserWorkUnit = '';
        this.newDirectorUnitChoice = '';
        this.newUserQuestionKeys = [];
        this.questionOptions.set([]);
        this.successMessage.set('La cuenta se creó correctamente.');
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  usersForArea(area: string): UserAccountView[] {
    return this.users().filter(user => user.role === 'RESPONSABLE_AREA'
      && user.area === area && user.enabled);
  }

  onNewUserAreaChange(area: string): void {
    this.newUserArea = area;
    this.newUserQuestionKeys = [];
    this.newUserWorkUnit = '';
    if (!area) {
      this.questionOptions.set([]);
      return;
    }
    if (area === 'DIRECCION_UNIDAD') {
      this.questionOptions.set([]);
      return;
    }
    this.api.questionsForArea(area).subscribe({
      next: questions => this.questionOptions.set(questions),
      error: error => this.showError(error)
    });
  }

  onNewUserWorkUnitChange(workUnit: string): void {
    this.newUserWorkUnit = workUnit;
    this.newUserQuestionKeys = [];
    if (this.newUserArea !== 'DIRECCION_UNIDAD' || !workUnit.trim()) {
      this.questionOptions.set([]);
      return;
    }
    this.api.questionsForArea(this.newUserArea, workUnit).subscribe({
      next: questions => this.questionOptions.set(questions),
      error: error => this.showError(error)
    });
  }

  onNewUserRoleChange(role: 'TALENTO_HUMANO' | 'RESPONSABLE_AREA' | 'DIRECTOR_UNIDAD'): void {
    this.newUserRole = role;
    if (role === 'DIRECTOR_UNIDAD') {
      this.newUserArea = 'DIRECCION_UNIDAD';
      this.newUserWorkUnit = '';
      this.newDirectorUnitChoice = '';
      this.newUserQuestionKeys = [];
      this.questionOptions.set([]);
    } else if (role === 'RESPONSABLE_AREA') {
      this.newUserArea = '';
      this.newUserWorkUnit = '';
      this.newDirectorUnitChoice = '';
      this.newUserQuestionKeys = [];
      this.questionOptions.set([]);
    } else if (role === 'TALENTO_HUMANO') {
      this.newUserArea = '';
      this.newUserWorkUnit = '';
      this.newDirectorUnitChoice = '';
      this.newUserQuestionKeys = [];
      this.questionOptions.set([]);
    }
  }

  onNewDirectorUnitChange(value: string): void {
    this.newDirectorUnitChoice = value;
    this.newUserWorkUnit = value;
  }

  toggleQuestionKey(questionKey: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.newUserQuestionKeys = checked
      ? [...new Set([...this.newUserQuestionKeys, questionKey])]
      : this.newUserQuestionKeys.filter(key => key !== questionKey);
  }

  assignAllAvailableQuestions(): void {
    const availableKeys = this.questionOptions()
      .filter(option => option.assignedUserId == null)
      .map(option => option.key);
    this.newUserQuestionKeys = [...new Set([...this.newUserQuestionKeys, ...availableKeys])];
  }

  openUserAdminFromRequest(): void {
    this.showCreate.set(false);
    this.openUsers();
  }

  editUserQuestions(user: UserAccountView): void {
    if (!user.area || user.role !== 'RESPONSABLE_AREA') return;
    this.editingUser.set(user);
    this.newUserArea = user.area;
    this.newUserWorkUnit = user.workUnit ?? '';
    this.newUserQuestionKeys = [...user.questionKeys];
    if (user.area === 'DIRECCION_UNIDAD') {
      const operationalArea = this.operationalAreaForWorkUnit(user.workUnit);
      if (!operationalArea) {
        this.showError(new Error('La unidad del director no coincide con un área operativa conocida.'));
        return;
      }
      this.newUserQuestionKeys = user.questionKeys.filter(key => key.startsWith(operationalArea.toLowerCase() + '_'));
      forkJoin([
        this.api.questionsForArea('DIRECCION_UNIDAD', user.workUnit),
        this.api.questionsForArea(operationalArea)
      ]).subscribe({
        next: ([unitQuestions, extraQuestions]) => this.questionOptions.set([...unitQuestions, ...extraQuestions]),
        error: error => this.showError(error)
      });
      return;
    }
    this.api.questionsForArea(user.area, user.workUnit).subscribe({
      next: questions => this.questionOptions.set(questions),
      error: error => this.showError(error)
    });
  }

  saveUserQuestions(): void {
    const user = this.editingUser();
    if (!user) return;
    this.saving.set(true);
    this.api.updateUserQuestions(user.id, this.newUserQuestionKeys).subscribe({
      next: updated => {
        this.saving.set(false);
        this.users.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.editingUser.set(null);
        this.newUserQuestionKeys = [];
        if (updated.area === 'DIRECCION_UNIDAD') {
          const operationalArea = this.operationalAreaForWorkUnit(updated.workUnit);
          if (operationalArea) forkJoin([
            this.api.questionsForArea('DIRECCION_UNIDAD', updated.workUnit),
            this.api.questionsForArea(operationalArea)
          ]).subscribe({ next: ([unitQuestions, extraQuestions]) => this.questionOptions.set([...unitQuestions, ...extraQuestions]) });
        } else {
          this.api.questionsForArea(updated.area!, updated.workUnit).subscribe({
            next: questions => this.questionOptions.set(questions)
          });
        }
        this.successMessage.set(`Preguntas de ${updated.fullName} actualizadas.`);
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  editUserProfile(user: UserAccountView): void {
    this.profileEditingUser.set(user);
    this.editUsername = user.username;
    this.editFullName = user.fullName;
    this.editEmail = user.email;
    this.editWorkUnit = user.workUnit ?? '';
    this.editAccountType = user.area === 'DIRECCION_UNIDAD' ? 'DIRECTOR_UNIDAD' : 'RESPONSABLE_AREA';
    this.editAccountArea = user.area === 'DIRECCION_UNIDAD' ? '' : user.area ?? '';
    this.editDirectorUnitChoice = this.isKnownWorkUnit(user.workUnit) ? user.workUnit! : '';
  }

  onEditAccountTypeChange(type: 'DIRECTOR_UNIDAD' | 'RESPONSABLE_AREA'): void {
    this.editAccountType = type;
    if (type === 'DIRECTOR_UNIDAD') {
      this.editAccountArea = '';
      this.editDirectorUnitChoice = '';
      this.editWorkUnit = '';
    }
  }

  onEditDirectorUnitChange(value: string): void {
    this.editDirectorUnitChoice = value;
    this.editWorkUnit = value;
  }

  isKnownWorkUnit(value: string | null | undefined): boolean {
    return !!value && Object.entries(this.areaNames)
      .some(([area, label]) => area !== 'DIRECCION_UNIDAD' && label === value);
  }

  saveUserProfile(): void {
    const user = this.profileEditingUser();
    if (!user) return;
    this.saving.set(true);
    this.api.updateUser(user.id, {
      username: this.editUsername.trim(),
      fullName: this.editFullName.trim(),
      email: this.editEmail.trim(),
      area: user.role !== 'RESPONSABLE_AREA' ? null
        : this.editAccountType === 'DIRECTOR_UNIDAD' ? 'DIRECCION_UNIDAD' : this.editAccountArea,
      workUnit: user.role === 'RESPONSABLE_AREA' && this.editAccountType === 'DIRECTOR_UNIDAD'
        ? this.editWorkUnit.trim() : null
    }).subscribe({
      next: updated => {
        this.users.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.profileEditingUser.set(null);
        this.saving.set(false);
        this.successMessage.set(updated.area === 'DIRECCION_UNIDAD'
          ? `La cuenta de ${updated.fullName} ahora es Director de unidad.`
          : `La cuenta de ${updated.fullName} ahora es Responsable de ${this.areaName(updated.area || '')}. Revisa su distribución de preguntas.`);
      },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  toggleUserEnabled(user: UserAccountView): void {
    const action = user.enabled ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Deseas ${action} la cuenta de ${user.fullName}?`)) return;
    this.saving.set(true);
    this.api.setUserEnabled(user.id, !user.enabled).subscribe({
      next: updated => {
        this.users.update(items => items.map(item => item.id === updated.id ? updated : item));
        this.saving.set(false);
        this.successMessage.set(`Cuenta ${updated.enabled ? 'activada' : 'desactivada'}.`);
      },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  deleteUser(user: UserAccountView): void {
    if (!window.confirm(`¿Eliminar la cuenta de ${user.fullName}? Si ya está vinculada a solicitudes o firmas, el sistema pedirá desactivarla para conservar el historial.`)) return;
    this.saving.set(true);
    this.api.deleteUser(user.id).subscribe({
      next: () => {
        this.users.update(items => items.filter(item => item.id !== user.id));
        this.saving.set(false);
        this.successMessage.set(`Cuenta de ${user.fullName} eliminada.`);
      },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  deleteRequest(): void {
    const request = this.selectedRequest();
    if (!request || !this.auth.isHumanResources()) return;
    const confirmed = window.confirm(
      `¿Eliminar definitivamente la solicitud de ${request.fullName} (#${request.id})? También se eliminarán sus archivos y su historial.`
    );
    if (!confirmed) return;
    this.saving.set(true);
    this.api.deleteRequest(request.id).subscribe({
      next: () => {
        const remaining = this.requests().filter(item => item.id !== request.id);
        this.requests.set(remaining);
        this.selectedId.set(remaining[0]?.id ?? null);
        this.saving.set(false);
        this.successMessage.set(`Solicitud #${request.id} eliminada.`);
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  createRequest(): void {
    const command: NewRequest = {
      fullName: this.fullName.trim(),
      identification: this.identification.trim(),
      email: this.email.trim(),
      secondaryEmail: this.secondaryEmail.trim() || null,
      directionResponsibleId: Number(this.directionResponsibleId),
      employmentType: this.employmentType.trim(),
      startDate: this.startDate,
      departureDate: this.departureDate,
      homeAddress: this.homeAddress.trim(),
      homePhone: this.homePhone.trim(),
      province: this.province.trim(),
      mobilePhone: this.mobilePhone.trim(),
      canton: this.canton.trim(),
      emergencyContact: this.emergencyContact.trim(),
      trackingUsername: this.trackingUsername.trim(),
      trackingPassword: this.trackingPassword
    };
    this.saving.set(true);
    this.clearNotices();
    this.api.create(command).subscribe({
      next: result => {
        this.saving.set(false);
        this.showCreate.set(false);
        this.fullName = '';
        this.identification = '';
        this.email = '';
        this.secondaryEmail = '';
        this.jobTitle = '';
        this.workUnit = '';
        this.employmentType = '';
        this.startDate = '';
        this.departureDate = '';
        this.homeAddress = '';
        this.homePhone = '';
        this.province = '';
        this.mobilePhone = '';
        this.canton = '';
        this.emergencyContact = '';
        this.workplace = '';
        this.occupationalGroup = '';
        this.directionResponsibleId = '';
        this.successMessage.set('Solicitud creada y enviada a la primera área.');
        this.credentials.set({ title: 'Acceso de seguimiento para entregar al solicitante',
          username: result.trackingUsername, password: result.trackingPassword });
        this.trackingUsername = '';
        this.trackingPassword = '';
        this.showCredentialPassword.set(false);
        this.loadRequests(result.request.id);
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  openCreateRequest(): void {
    this.showCreate.set(true);
    if (!this.trackingUsername) {
      const digits = this.identification.replace(/\D/g, '');
      this.trackingUsername = `solicitante-${digits || 'nuevo'}`;
    }
    if (!this.trackingPassword) this.trackingPassword = this.identification.replace(/\D/g, '');
    this.checkingQuestionAssignments.set(true);
    this.api.listUsers().subscribe({ next: list => this.users.set(list), error: error => this.showError(error) });
    const areaKeys = Object.keys(this.areaNames).filter(area => area !== 'DIRECCION_UNIDAD');
    forkJoin(areaKeys.map(area => this.api.questionsForArea(area))).subscribe({
      next: groups => {
        const missing = groups.flatMap((questions, index) => questions
          .filter(question => question.assignedUserId == null)
          .map(question => `${this.areaName(areaKeys[index])}: ${question.label}`));
        this.unassignedQuestionLabels.set(missing);
        this.checkingQuestionAssignments.set(false);
      },
      error: error => {
        this.checkingQuestionAssignments.set(false);
        this.showError(error);
      }
    });
  }

  get directionManagers(): UserAccountView[] {
    return this.users().filter(user => user.enabled && user.role === 'RESPONSABLE_AREA' && user.area === 'DIRECCION_UNIDAD');
  }

  addCustomQuestion(): void {
    if (!this.customQuestionArea || !this.customQuestionLabel.trim()) return;
    this.saving.set(true);
    this.api.addQuestion(this.customQuestionArea, this.customQuestionLabel.trim()).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set(`Pregunta agregada a ${this.areaName(this.customQuestionArea)}. Asígnala al responsable para solicitudes nuevas.`);
        this.customQuestionLabel = '';
        if (this.editingUser()?.area === this.customQuestionArea) this.editUserQuestions(this.editingUser()!);
      },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  saveWorkDetails(): void {
    const request = this.selectedRequest();
    if (!request) return;
    const workUnit = this.workUnit.trim() || request.workUnit || this.auth.user()?.workUnit || '';
    const workplace = this.workplace || request.workplace || '';
    const occupationalGroup = this.occupationalGroup.trim() || request.occupationalGroup || '';
    const jobTitle = this.jobTitle.trim() || request.jobTitle || '';
    if (!workplace || !occupationalGroup.trim() || !workUnit.trim() || !jobTitle.trim()) {
      this.errorMessage.set('Completa Lugar de trabajo, Grupo ocupacional, Dirección/unidad y Cargo desempeñado antes de guardar.');
      return;
    }
    this.saving.set(true);
    this.api.updateWorkDetails(request.id, { workplace, occupationalGroup: occupationalGroup.trim(), workUnit: workUnit.trim(), jobTitle: jobTitle.trim() }).subscribe({
      next: updated => { this.saving.set(false); this.replaceRequest(updated); this.successMessage.set('Datos laborales guardados.'); },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  onRequestWorkUnitChange(workUnit: string): void {
    this.workUnit = workUnit;
    if (!workUnit) {
      this.unassignedQuestionLabels.update(labels => labels.filter(label => !label.startsWith('Dirección / unidad:')));
      return;
    }
    this.checkingQuestionAssignments.set(true);
    this.api.questionsForArea('DIRECCION_UNIDAD', workUnit).subscribe({
      next: questions => {
        const missing = questions.filter(question => question.assignedUserId == null)
          .map(question => `Dirección / unidad (${workUnit}): ${question.label}`);
        const otherAreas = this.unassignedQuestionLabels().filter(label => !label.startsWith('Dirección / unidad'));
        this.unassignedQuestionLabels.set([...otherAreas, ...missing]);
        this.checkingQuestionAssignments.set(false);
      },
      error: error => {
        this.checkingQuestionAssignments.set(false);
        this.showError(error);
      }
    });
  }

  onIdentificationChange(value: string): void {
    this.identification = value;
    const digits = value.replace(/\D/g, '').slice(0, 10);
    this.trackingUsername = `solicitante-${digits || 'nuevo'}`;
    this.trackingPassword = digits;
    this.showTrackingPassword.set(false);
  }

  generateTrackingPassword(): void {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    this.trackingPassword = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
    this.showTrackingPassword.set(false);
  }

  resetUserPassword(user: UserAccountView): void {
    this.resettingPasswordUser.set(user);
    this.resetPasswordValue = '';
    this.showResetPassword.set(false);
  }

  submitPasswordReset(): void {
    const user = this.resettingPasswordUser();
    const password = this.resetPasswordValue.trim();
    if (!user || !password || password.length > 72) return;
    this.saving.set(true);
    this.api.resetUserPassword(user.id, password).subscribe({
      next: result => {
        this.saving.set(false);
        this.resettingPasswordUser.set(null);
        this.credentials.set({ title: `Contraseña temporal de ${user.fullName}`,
          username: user.username, password: result.temporaryPassword });
        this.showCredentialPassword.set(false);
      },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  resetPasswordToIdentification(): void {
    const user = this.resettingPasswordUser();
    if (!user) return;
    this.saving.set(true);
    this.api.resetUserPasswordToIdentification(user.id).subscribe({
      next: result => {
        this.saving.set(false);
        this.resettingPasswordUser.set(null);
        this.credentials.set({ title: `Contraseña restablecida para ${user.fullName}`,
          username: user.username, password: result.temporaryPassword });
        this.showCredentialPassword.set(false);
      },
      error: error => { this.saving.set(false); this.showError(error); }
    });
  }

  saveAnswers(): void {
    const request = this.selectedRequest();
    const section = this.activeSection;
    if (!request || !section) return;
    if (section.area === 'DIRECCION_UNIDAD' && !this.hasSavedWorkDetails(request)) {
      this.errorMessage.set('Guarda primero los datos laborales completos para responder esta etapa.');
      return;
    }

    this.saving.set(true);
    this.clearNotices();
    const answers = section.answers.filter(answer => !answer.signedAt).map(answer => ({
      questionKey: answer.questionKey,
      answerValue: answer.answerValue || '',
      detail: answer.detail || '',
      amount: answer.amount
    }));

    this.api.saveAnswers(request.id, section.id, answers).subscribe({
      next: updated => {
        this.saving.set(false);
        this.replaceRequest(updated);
        this.successMessage.set('Respuestas guardadas. El área todavía no está confirmada.');
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  printSectionForFirmaEc(): void {
    const request = this.selectedRequest();
    const section = this.activeSection;
    if (!request || !section) return;

    if (section.area === 'DIRECCION_UNIDAD' && !this.hasSavedWorkDetails(request)) {
      this.errorMessage.set('Guarda primero los datos laborales completos para generar el PDF de FirmaEC.');
      return;
    }

    const incomplete = section.answers.some(answer => answer.answerValue !== 'SI' && answer.answerValue !== 'NO');
    if (incomplete) {
      this.errorMessage.set('Responde todas las preguntas antes de generar el PDF para FirmaEC.');
      return;
    }
    const missingFields = section.answers.some(answer => !answer.signedAt && !this.hasAllAnswerFields(answer));
    if (missingFields) {
      this.errorMessage.set('Completa todos los campos escritos de tus preguntas antes de generar el PDF para FirmaEC.');
      return;
    }
    this.saving.set(true);
    this.clearNotices();
    const answers = section.answers.filter(answer => !answer.signedAt).map(answer => ({
      questionKey: answer.questionKey,
      answerValue: answer.answerValue,
      detail: answer.detail || '',
      amount: answer.amount
    }));
    this.api.saveAnswers(request.id, section.id, answers).subscribe({
      next: updated => {
        this.saving.set(false);
        this.replaceRequest(updated);
        const savedSection = updated.sections.find(item => item.id === section.id);
        if (savedSection) {
          this.downloadSectionForFirmaEc(updated, savedSection);
          this.successMessage.set('PDF descargado. Ábrelo en FirmaEC, fírmalo y carga aquí el PDF firmado.');
        }
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  private downloadSectionForFirmaEc(request: PazRequest, section: AreaSection): void {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    this.drawFormHeader(doc);
    let y = this.addSectionIdentityDetails(doc, request, 37);
    y = this.ensureFormSpace(doc, y + 8, 28);
    this.drawFormSectionTitle(doc, this.formSectionTitle(section.area), y);
    autoTable(doc, {
      startY: y + 5,
      head: [['DETALLE', 'S/N', 'DATO ADICIONAL', 'NOMBRE RESPONSABLE']],
      body: section.answers.filter(answer => !answer.signedAt).map(answer => [
        answer.questionLabel,
        answer.answerValue === 'SI' ? 'SÍ' : answer.answerValue === 'NO' ? 'NO' : '-',
        [this.formatAnswerDetail(answer), answer.amount == null ? '' : `Valor a descontar: $ ${answer.amount.toFixed(2)}`]
          .filter(Boolean).join('\n') || '-',
        this.auth.user()?.fullName ?? answer.assignedUserName ?? '-'
      ]),
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [22, 59, 91], fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 68 }, 1: { cellWidth: 12 }, 2: { cellWidth: 57 }, 3: { cellWidth: 53 } },
      margin: { left: 10, right: 10, top: 35 },
      didDrawPage: () => this.drawFormHeader(doc)
    });
    const tableBottom = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
    let signatureY = tableBottom + 10;
    if (signatureY + 28 > 275) {
      doc.addPage();
      this.drawFormHeader(doc);
      signatureY = 40;
    }
    doc.setDrawColor(22, 59, 91);
    doc.setFillColor(246, 249, 252);
    doc.roundedRect(12, signatureY, 186, 27, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(22, 59, 91);
    doc.text('FIRMA ELECTRÓNICA ÚNICA DEL RESPONSABLE', 16, signatureY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('La firma de este documento cubre todas las preguntas listadas en este apartado.', 16, signatureY + 13);
    doc.text(`Responsable: ${this.auth.user()?.fullName ?? section.assignedUserName ?? '-'}`, 16, signatureY + 19);
    doc.text('Firme una sola vez en FirmaEC y cargue aquí el PDF firmado completo.', 16, signatureY + 24);
    this.addPageNumbers(doc);
    doc.save(`firmaec-apartado-${section.area}-${request.id}.pdf`);
  }

  onSignedSectionFileChange(event: Event): void {
    const request = this.selectedRequest();
    const section = this.activeSection;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!request || !section || !file) return;
    if (file.type !== 'application/pdf') {
      this.errorMessage.set('Selecciona el PDF que firmaste con FirmaEC.');
      input.value = '';
      return;
    }
    this.saving.set(true);
    this.clearNotices();
    this.api.uploadSignedSection(request.id, section.id, file).subscribe({
      next: updated => {
        this.saving.set(false);
        this.replaceRequest(updated);
        this.successMessage.set('PDF firmado recibido y bloqueado. Se habilitó el siguiente apartado.');
        input.value = '';
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
        input.value = '';
      }
    });
  }

  printDocument(): void {
    const request = this.selectedRequest();
    if (!request) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    this.drawFormHeader(doc);
    let y = this.addPersonalDetails(doc, request, 37);
    y = this.ensureFormSpace(doc, y + 6, 34);
    y = this.addWorkDetails(doc, request, y);
    y += 7;
    request.sections.forEach(section => {
      y = this.ensureFormSpace(doc, y, 30);
      this.drawFormSectionTitle(doc, this.formSectionTitle(section.area), y);
      autoTable(doc, {
        startY: y + 5,
        head: [['DETALLE', 'S/N', 'DATO ADICIONAL', 'NOMBRE RESPONSABLE', 'FIRMA RESPONSABLE']],
        body: section.answers.map(answer => [
          answer.questionLabel,
          answer.answerValue === 'SI' ? 'SÍ' : answer.answerValue === 'NO' ? 'NO' : '-',
          [this.formatAnswerDetail(answer), answer.amount == null ? '' : `Valor a descontar: $ ${answer.amount.toFixed(2)}`]
            .filter(Boolean).join('\n') || '-',
          answer.signerName || answer.assignedUserName || '-',
          answer.signedAt ? `[ Firmada ${this.formatDate(answer.signedAt)} ]` : '[ Pendiente Firma ]'
        ]),
        styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [22, 59, 91], fontSize: 6.5 },
        columnStyles: { 0: { cellWidth: 66 }, 1: { cellWidth: 12 }, 2: { cellWidth: 42 }, 3: { cellWidth: 31 }, 4: { cellWidth: 29 } },
        margin: { left: 10, right: 10, top: 35 },
        didDrawPage: () => this.drawFormHeader(doc)
      });
      y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
    });
    y = this.ensureFormSpace(doc, y, 80);
    this.drawFormSectionTitle(doc, '10. AUTORIZACIÓN - SERVIDOR SALIENTE', y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const authorization = 'Conforme lo establecido en el artículo 110 del Reglamento a la Ley Orgánica de Servicio Público (LOSEP), quien suscribe el presente formulario de paz y salvo para la liquidación de haberes que me corresponde, AUTORIZO a la DIRECCIÓN ADMINISTRATIVA FINANCIERA del INAMHI para que efectúe los descuentos detallados en el presente documento por reintegro y/o recuperación de valores, bienes y/o especies que se hayan encontrado a mi cargo y no hayan sido devueltos en las condiciones recibidas. Los valores correspondientes serán DESCONTADOS a través de mi rol de pagos y/o liquidación de haberes.';
    const lines = doc.splitTextToSize(authorization, 185);
    doc.text(lines, 12, y + 8);
    const signatureY = y + 13 + lines.length * 4;
    doc.setFont('helvetica', 'bold');
    doc.text('[ FirmaEC PAdES - Servidor Saliente ]', 12, signatureY + 22);
    doc.setFont('helvetica', 'normal');
    doc.text(`C.C.: ${request.identification}`, 12, signatureY + 31);
    doc.text(`FECHA: ${this.formatDate(new Date().toISOString())}`, 120, signatureY + 31);
    this.addPageNumbers(doc);
    doc.save(`paz-y-salvo-${request.id}.pdf`);
  }

  private drawFormHeader(doc: jsPDF): void {
    const width = doc.internal.pageSize.getWidth();
    doc.setTextColor(22, 59, 91);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('INSTITUTO NACIONAL DE METEOROLOGÍA E HIDROLOGÍA - INAMHI', width / 2, 10, { align: 'center' });
    doc.setFontSize(8);
    doc.text('INAMHI-RH-001', width - 10, 16, { align: 'right' });
    doc.setFontSize(11);
    doc.text('FORMULARIO PAZ Y SALVO - LIQUIDACIÓN DE HABERES', width / 2, 22, { align: 'center' });
    doc.setDrawColor(22, 59, 91);
    doc.line(10, 27, width - 10, 27);
    doc.setTextColor(25, 39, 53);
  }

  private drawFormSectionTitle(doc: jsPDF, title: string, y: number): void {
    doc.setFillColor(232, 239, 245);
    doc.setDrawColor(190, 204, 216);
    doc.roundedRect(10, y - 4, doc.internal.pageSize.getWidth() - 20, 7, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(22, 59, 91);
    doc.text(title.toLocaleUpperCase('es-EC'), 12, y + 0.5);
    doc.setTextColor(25, 39, 53);
  }

  private addPersonalDetails(doc: jsPDF, request: PazRequest, startY: number): number {
    this.drawFormSectionTitle(doc, '01. DATOS PERSONALES DEL SERVIDOR SALIENTE', startY);
    autoTable(doc, {
      startY: startY + 4,
      body: [
        ['Nombres y apellidos', request.fullName, 'Cédula de ciudadanía / pasaporte', request.identification],
        ['Modalidad laboral', request.employmentType || '-', 'Fecha de ingreso', request.startDate || '-'],
        ['Fecha de salida', request.departureDate || '-', 'Dirección domiciliaria', request.homeAddress || '-'],
        ['Número domicilio', request.homePhone || '-', 'Provincia', request.province || '-'],
        ['Número celular', request.mobilePhone || '-', 'Cantón', request.canton || '-'],
        ['Contacto emergencia', request.emergencyContact || '-', 'Email (1)', request.email],
        ['Email (2)', request.secondaryEmail || '-', 'Solicitud', `#${request.id}`]
      ],
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 37 }, 1: { cellWidth: 58 }, 2: { fontStyle: 'bold', cellWidth: 37 }, 3: { cellWidth: 58 } },
      theme: 'grid',
      margin: { left: 10, right: 10, top: 35 },
      didDrawPage: () => this.drawFormHeader(doc)
    });
    return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 40;
  }

  private addSectionIdentityDetails(doc: jsPDF, request: PazRequest, startY: number): number {
    this.drawFormSectionTitle(doc, '01. DATOS PERSONALES DEL SERVIDOR SALIENTE', startY);
    autoTable(doc, {
      startY: startY + 4,
      body: [
        ['Nombres y apellidos', request.fullName, 'Cédula / pasaporte', request.identification],
        ['Dirección / unidad', request.workUnit || '-', 'Cargo desempeñado', request.jobTitle || '-']
      ],
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 37 }, 1: { cellWidth: 58 }, 2: { fontStyle: 'bold', cellWidth: 37 }, 3: { cellWidth: 58 } },
      theme: 'grid',
      margin: { left: 10, right: 10, top: 35 },
      didDrawPage: () => this.drawFormHeader(doc)
    });
    return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 25;
  }

  private addWorkDetails(doc: jsPDF, request: PazRequest, startY: number): number {
    const y = this.ensureFormSpace(doc, startY, 24);
    this.drawFormSectionTitle(doc, '02. DIRECCIÓN / UNIDAD', y);
    autoTable(doc, {
      startY: y + 4,
      body: [
        ['Lugar de trabajo desconcentrado', request.workplace || '-', 'Grupo ocupacional', request.occupationalGroup || '-'],
        ['Dirección / unidad', request.workUnit || '-', 'Cargo desempeñado', request.jobTitle || '-']
      ],
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 37 }, 1: { cellWidth: 58 }, 2: { fontStyle: 'bold', cellWidth: 37 }, 3: { cellWidth: 58 } },
      theme: 'grid',
      margin: { left: 10, right: 10, top: 35 },
      didDrawPage: () => this.drawFormHeader(doc)
    });
    return (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  }

  private ensureFormSpace(doc: jsPDF, y: number, requiredHeight: number): number {
    if (y + requiredHeight > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      this.drawFormHeader(doc);
      return 36;
    }
    return y;
  }

  private addPageNumbers(doc: jsPDF): void {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page++) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 105, 120);
      doc.text(`PÁGINA ${page}/${totalPages}`, doc.internal.pageSize.getWidth() - 10,
        doc.internal.pageSize.getHeight() - 7, { align: 'right' });
    }
    doc.setTextColor(25, 39, 53);
  }

  private formSectionTitle(area: string): string {
    const sectionTitles: Record<string, string> = {
      DIRECCION_UNIDAD: '03. GESTIÓN DOCUMENTAL Y TRÁMITES',
      GESTION_ADMINISTRATIVA: '04. GESTIÓN ADMINISTRATIVA',
      TIC: '05. GESTIÓN TIC',
      GESTION_FINANCIERA: '06. GESTIÓN FINANCIERA',
      SEGURIDAD_INFORMACION: '07. SEGURIDAD (EGSI)',
      RECURSOS_HUMANOS: '08. RECURSOS HUMANOS',
      RECEPCION_DOCUMENTOS: '09. RECEPCIÓN DOCUMENTOS'
    };
    return sectionTitles[area] ?? this.areaName(area);
  }

  onSignedFileChange(event: Event): void {
    const request = this.selectedRequest();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!request || !file) return;
    if (file.type !== 'application/pdf') {
      this.errorMessage.set('Selecciona un archivo PDF firmado.');
      input.value = '';
      return;
    }
    this.saving.set(true);
    this.clearNotices();
    this.api.uploadSignedDocument(request.id, file).subscribe({
      next: updated => {
        this.saving.set(false);
        this.replaceRequest(updated);
        this.successMessage.set('PDF recibido. Su SHA-256 quedó registrado.');
        input.value = '';
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
        input.value = '';
      }
    });
  }

  setFinalStatus(): void {
    const request = this.selectedRequest();
    if (!request) return;
    this.saving.set(true);
    this.clearNotices();
    this.api.updateFinalStatus(request.id, this.finalStatus(), this.finalObservation()).subscribe({
      next: updated => {
        this.saving.set(false);
        this.replaceRequest(updated);
        this.successMessage.set(`Solicitud marcada como ${this.statusLabel(updated.status)}.`);
      },
      error: error => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  loadAudit(): void {
    const request = this.selectedRequest();
    if (!request) return;
    this.api.audit(request.id).subscribe({
      next: entries => {
        this.auditEntries = entries;
        this.showAudit.set(true);
      },
      error: error => this.showError(error)
    });
  }

  areaName(area: string): string {
    return this.areaNames[area] ?? area;
  }

  isDirectorUnitQuestion(key: string): boolean {
    return key.startsWith('direccion_unidad_');
  }

  operationalAreaForWorkUnit(workUnit: string | null | undefined): string | null {
    if (!workUnit) return null;
    const normalized = workUnit.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    if (normalized.includes('tic') || normalized.includes('tecnolog')) return 'TIC';
    if (normalized.includes('financ')) return 'GESTION_FINANCIERA';
    if (normalized.includes('seguridad')) return 'SEGURIDAD_INFORMACION';
    if (normalized.includes('recursos humanos') || normalized === 'talento humano') return 'RECURSOS_HUMANOS';
    if (normalized.includes('recepcion') || normalized.includes('documentos')) return 'RECEPCION_DOCUMENTOS';
    if (normalized.includes('administrativ')) return 'GESTION_ADMINISTRATIVA';
    return null;
  }

  statusLabel(status: RequestStatus): string {
    const labels: Record<RequestStatus, string> = {
      EN_PROCESO: 'En proceso',
      PENDIENTE_FIRMA_EXFUNCIONARIO: 'Pendiente de firma',
      EN_REVISION: 'En revisión',
      APROBADO: 'Aprobado',
      NEGADO: 'Negado'
    };
    return labels[status];
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(value));
  }

  answerFieldValue(answer: AreaSection['answers'][number], field: string): string {
    const values = this.readAnswerFields(answer.detail, answer.writingFields);
    return values[field] ?? '';
  }

  setAnswerField(answer: AreaSection['answers'][number], field: string, value: string): void {
    const values = this.readAnswerFields(answer.detail, answer.writingFields);
    values[field] = value;
    answer.detail = `__FIELDS__:${JSON.stringify(values)}`;
  }

  onAnswerValueChange(answer: AreaSection['answers'][number], value: 'SI' | 'NO'): void {
    if (value !== 'NO') return;
    for (const field of answer.writingFields ?? []) {
      if (field.toLowerCase().includes('valor a descontar')) {
        answer.amount ??= 0;
      } else if (!this.answerFieldValue(answer, field).trim()) {
        this.setAnswerField(answer, field, 'No aplica');
      }
    }
  }

  private hasAllAnswerFields(answer: AreaSection['answers'][number]): boolean {
    const fields = answer.writingFields ?? [];
    if (!fields.length) return !!answer.detail?.trim();
    return fields.every(field => field.toLowerCase().includes('valor a descontar')
      ? answer.amount != null && Number.isFinite(answer.amount) && answer.amount >= 0
      : !!this.answerFieldValue(answer, field).trim());
  }

  private formatAnswerDetail(answer: AreaSection['answers'][number]): string {
    if (!answer.detail) return '';
    const values = this.readAnswerFields(answer.detail, answer.writingFields ?? []);
    if (!Object.keys(values).length) return answer.detail;
    return Object.entries(values).filter(([, value]) => value.trim())
      .map(([label, value]) => `${label}: ${value}`).join('\n');
  }

  private readAnswerFields(detail: string | null, fields: string[]): Record<string, string> {
    if (!detail) return {};
    if (detail.startsWith('__FIELDS__:')) {
      try {
        const value = JSON.parse(detail.slice('__FIELDS__:'.length)) as Record<string, unknown>;
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? '')]));
      } catch {
        return {};
      }
    }
    if (fields.length) return { [fields[0]]: detail };
    return {};
  }

  private replaceRequest(updated: PazRequest): void {
    this.requests.update(items => items.map(item => item.id === updated.id ? updated : item));
  }

  private showError(error: unknown): void {
    const response = error as HttpErrorResponse;
    if (response.status === 500) {
      const detail = typeof response.error === 'string'
        ? response.error
        : response.error?.detail ?? response.error?.message;
      this.errorMessage.set(detail || 'El servidor tuvo un error interno. Revisa la terminal donde ejecutaste mvn spring-boot:run para ver la excepción completa.');
      return;
    }
    const message = typeof response.error === 'string'
      ? response.error
      : response.error?.detail ?? response.error?.message ?? response.message;
    this.errorMessage.set(message || 'No se pudo completar la operación. Verifica que la API esté iniciada.');
  }

  private async showBlobError(error: unknown): Promise<void> {
    const response = error as HttpErrorResponse;
    if (response.error instanceof Blob) {
      const body = await response.error.text();
      try {
        const payload = JSON.parse(body) as { detail?: string; message?: string };
        this.errorMessage.set(payload.detail || payload.message || `No se pudo descargar el PDF firmado (HTTP ${response.status}).`);
      } catch {
        this.errorMessage.set(body || `No se pudo descargar el PDF firmado (HTTP ${response.status}).`);
      }
      return;
    }
    this.showError(error);
  }

  private clearNotices(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char] ?? char);
  }
}
