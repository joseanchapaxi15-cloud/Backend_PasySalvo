import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: 'TALENTO_HUMANO' | 'RESPONSABLE_AREA' | 'SOLICITANTE';
  area: string | null;
  workUnit: string | null;
  enabled: boolean;
  createdAt: string;
}

export interface LoginCommand {
  username: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly profile = signal<UserProfile | null>(this.readStoredProfile());
  private readonly basicHeader = signal<string | null>(sessionStorage.getItem('paz-salvo-auth-header'));

  readonly user = this.profile.asReadonly();
  readonly isAuthenticated = computed(() => this.profile() !== null);
  readonly isHumanResources = computed(() => this.profile()?.role === 'TALENTO_HUMANO');

  login(command: LoginCommand): Observable<UserProfile> {
    return this.http.post<UserProfile>('/api/auth/login', command).pipe(
      tap(user => {
        const credential = `${command.username}:${command.password}`;
        const bytes = new TextEncoder().encode(credential);
        const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
        const authorization = `Basic ${btoa(binary)}`;
        this.basicHeader.set(authorization);
        this.profile.set(user);
        sessionStorage.setItem('paz-salvo-auth-header', authorization);
        sessionStorage.setItem('paz-salvo-user-profile', JSON.stringify(user));
      })
    );
  }

  authorizationHeader(): string | null {
    return this.basicHeader();
  }

  logout(): void {
    this.basicHeader.set(null);
    this.profile.set(null);
    sessionStorage.removeItem('paz-salvo-auth-header');
    sessionStorage.removeItem('paz-salvo-user-profile');
  }

  private readStoredProfile(): UserProfile | null {
    const storedProfile = sessionStorage.getItem('paz-salvo-user-profile');
    if (!storedProfile) return null;
    try {
      return JSON.parse(storedProfile) as UserProfile;
    } catch {
      sessionStorage.removeItem('paz-salvo-user-profile');
      sessionStorage.removeItem('paz-salvo-auth-header');
      return null;
    }
  }
}
