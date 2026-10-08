import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authorization = inject(AuthService).authorizationHeader();
  if (!authorization || !request.url.startsWith('/api/')) {
    return next(request);
  }
  return next(request.clone({
    setHeaders: { Authorization: authorization }
  }));
};
