export type RequestStatus =
  | 'EN_PROCESO'
  | 'PENDIENTE_FIRMA_EXFUNCIONARIO'
  | 'EN_REVISION'
  | 'APROBADO'
  | 'NEGADO';

export type SectionStatus = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA';

export interface Answer {
  questionKey: string;
  questionLabel: string;
  answerValue: '' | 'SI' | 'NO' | null;
  detail: string | null;
  amount: number | null;
  assignedUserId: number | null;
  assignedUserName: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signedAt: string | null;
  signedDocumentSha256: string | null;
  writingFields: string[];
}

export interface AreaSection {
  id: number;
  area: string;
  sequenceNumber: number;
  status: SectionStatus;
  assignedUserId: number | null;
  assignedUserName: string | null;
  assignedUserEmail: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signedAt: string | null;
  answers: Answer[];
}

export interface UserAccountView {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: 'TALENTO_HUMANO' | 'RESPONSABLE_AREA' | 'SOLICITANTE';
  area: string | null;
  workUnit: string | null;
  enabled: boolean;
  createdAt: string;
  questionKeys: string[];
}

export interface QuestionOption {
  key: string;
  label: string;
  assignedUserId: number | null;
  assignedUserName: string | null;
  writingFields: string[];
}

export interface PazRequest {
  id: number;
  fullName: string;
  identification: string;
  email: string;
  jobTitle: string | null;
  workUnit: string | null;
  employmentType: string | null;
  startDate: string | null;
  departureDate: string | null;
  homeAddress: string | null;
  homePhone: string | null;
  province: string | null;
  mobilePhone: string | null;
  canton: string | null;
  emergencyContact: string | null;
  secondaryEmail: string | null;
  workplace: string | null;
  occupationalGroup: string | null;
  status: RequestStatus;
  createdAt: string;
  signedDocumentSha256: string | null;
  signedDocumentUploadedAt: string | null;
  sections: AreaSection[];
}

export interface AuditEntry {
  id: number;
  action: string;
  actor: string;
  occurredAt: string;
  details: string;
}
