import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditEntry, PazRequest, QuestionOption, UserAccountView } from './models';

export interface NewRequest {
  fullName: string;
  identification: string;
  email: string;
  secondaryEmail: string | null;
  directionResponsibleId: number;
  employmentType: string;
  startDate: string;
  departureDate: string;
  homeAddress: string;
  homePhone: string;
  province: string;
  mobilePhone: string;
  canton: string;
  emergencyContact: string;
  trackingUsername: string;
  trackingPassword: string;
}

export interface CreatedRequest {
  request: PazRequest;
  trackingUsername: string;
  trackingPassword: string;
}

export interface NewUser {
  username: string;
  fullName: string;
  email: string;
  password: string;
  role: 'TALENTO_HUMANO' | 'RESPONSABLE_AREA';
  area: string | null;
  workUnit: string | null;
  questionKeys: string[];
}

@Injectable({ providedIn: 'root' })
export class PazSalvoApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/requests';

  list(): Observable<PazRequest[]> {
    return this.http.get<PazRequest[]>(this.baseUrl);
  }

  listUsers(): Observable<UserAccountView[]> {
    return this.http.get<UserAccountView[]>('/api/users');
  }

  questionsForArea(area: string, workUnit?: string | null): Observable<QuestionOption[]> {
    let params = new HttpParams().set('area', area);
    if (workUnit) params = params.set('workUnit', workUnit);
    return this.http.get<QuestionOption[]>('/api/users/questions', { params });
  }

  directionUnits(): Observable<string[]> {
    return this.http.get<string[]>('/api/users/units');
  }

  createUser(user: NewUser): Observable<UserAccountView> {
    return this.http.post<UserAccountView>('/api/users', user);
  }

  updateUserQuestions(userId: number, questionKeys: string[]): Observable<UserAccountView> {
    return this.http.put<UserAccountView>(`/api/users/${userId}/questions`, { questionKeys });
  }

  updateUser(userId: number, user: Pick<NewUser, 'username' | 'fullName' | 'email' | 'area' | 'workUnit'>): Observable<UserAccountView> {
    return this.http.patch<UserAccountView>(`/api/users/${userId}`, user);
  }

  setUserEnabled(userId: number, enabled: boolean): Observable<UserAccountView> {
    return this.http.patch<UserAccountView>(`/api/users/${userId}/status`, { enabled });
  }

  deleteUser(userId: number): Observable<void> {
    return this.http.delete<void>(`/api/users/${userId}`);
  }

  resetUserPassword(userId: number, newPassword: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/users/${userId}/reset-password`, { newPassword });
  }

  resetUserPasswordToIdentification(userId: number): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/users/${userId}/reset-password/identification`, {});
  }

  create(request: NewRequest): Observable<CreatedRequest> {
    return this.http.post<CreatedRequest>(this.baseUrl, request);
  }

  addQuestion(area: string, label: string): Observable<unknown> {
    return this.http.post('/api/users/questions', { area, label });
  }

  updateWorkDetails(requestId: number, details: { workplace: string; occupationalGroup: string; workUnit: string; jobTitle: string }): Observable<PazRequest> {
    return this.http.put<PazRequest>(`${this.baseUrl}/${requestId}/work-details`, details);
  }

  deleteRequest(requestId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${requestId}`);
  }

  saveAnswers(requestId: number, sectionId: number, answers: unknown[]): Observable<PazRequest> {
    return this.http.put<PazRequest>(
      `${this.baseUrl}/${requestId}/sections/${sectionId}/answers`,
      { answers }
    );
  }

  confirmSection(
    requestId: number,
    sectionId: number
  ): Observable<PazRequest> {
    return this.http.post<PazRequest>(
      `${this.baseUrl}/${requestId}/sections/${sectionId}/confirm`,
      {}
    );
  }

  uploadSignedSection(requestId: number, sectionId: number, file: File): Observable<PazRequest> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<PazRequest>(
      `${this.baseUrl}/${requestId}/sections/${sectionId}/signed-document`, body
    );
  }

  downloadSignedSection(requestId: number, sectionId: number, userId?: number): Observable<Blob> {
    let params = new HttpParams();
    if (userId != null) params = params.set('userId', userId.toString());
    return this.http.get(
      `${this.baseUrl}/${requestId}/sections/${sectionId}/signed-document`,
      { params, responseType: 'blob' }
    );
  }

  uploadSignedDocument(requestId: number, file: File): Observable<PazRequest> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<PazRequest>(`${this.baseUrl}/${requestId}/signed-document`, body);
  }

  updateFinalStatus(
    requestId: number,
    status: 'APROBADO' | 'NEGADO',
    observation: string
  ): Observable<PazRequest> {
    const params = new HttpParams().set('status', status).set('observation', observation);
    return this.http.post<PazRequest>(`${this.baseUrl}/${requestId}/final-status`, null, { params });
  }

  audit(requestId: number): Observable<AuditEntry[]> {
    return this.http.get<AuditEntry[]>(`${this.baseUrl}/${requestId}/audit`);
  }

  exportReport(): Observable<Blob> {
    return this.http.get('/api/reports/export.csv', { responseType: 'blob' });
  }

  downloadSignedDocument(requestId: number): Observable<Blob> {
    return this.http.get(this.signedDocumentUrl(requestId), { responseType: 'blob' });
  }

  signedDocumentUrl(requestId: number): string {
    return `${this.baseUrl}/${requestId}/signed-document`;
  }
}
