import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionTimeoutService } from '../services/session-timeout.service';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const sessionTimeoutService = inject(SessionTimeoutService);

  // Get token from localStorage
  const raw = localStorage.getItem('optern_user');

  if (raw) {
    try {
      const user = JSON.parse(raw);
      if (user && user.token) {
        // Clone the request and add auth header
        const authReq = req.clone({
          headers: req.headers.set('Authorization', `Bearer ${user.token}`)
        });

        // Intercept responses to detect 401 errors
        return next(authReq).pipe(
          catchError((error) => {
            if (error.status === 401) {
              // Only trigger session timeout for authenticated requests that require auth
              // Don't trigger timeout for endpoints that might legitimately return 401
              // (like applications/by-candidate which has [AllowAnonymous] but tries auth,
              // or jobs endpoints that may be called for different user roles)
              const isPublicEndpoint = req.url.includes('/applications/by-candidate') ||
                                      req.url.includes('/api/Jobs');
              if (!isPublicEndpoint && !sessionTimeoutService.isSessionExpired()) {
                console.log('401 response received for authenticated endpoint, triggering session timeout');
                sessionTimeoutService.triggerSessionTimeout();
              } else {
                console.log('401 response received for public endpoint, not triggering session timeout');
              }
            }
            return throwError(() => error);
          })
        );
      }
    } catch (error) {
      // Clear invalid data
      localStorage.removeItem('optern_user');
    }
  }

  // For requests without auth, don't trigger session timeout on 401
  // These are likely public endpoints that don't require authentication
  return next(req).pipe(
    catchError((error) => {
      // Don't trigger session timeout for unauthenticated requests
      // The endpoint should handle its own error responses
      return throwError(() => error);
    })
  );
};
