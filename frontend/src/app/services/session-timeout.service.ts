import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SessionTimeoutService {
  private sessionExpiredSubject = new BehaviorSubject<boolean>(false);
  public sessionExpired$ = this.sessionExpiredSubject.asObservable();

  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
  private timeoutTimer: any;
  private isWindowFocused: boolean = true;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.initializeSessionTimeout();
  }

  private initializeSessionTimeout() {
    // Start the session timeout timer
    this.startTimeoutTimer();

    // Listen for user activity to reset the timer
    this.setupActivityListeners();
  }

  private startTimeoutTimer() {
    // Clear any existing timer
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }

    // Only start timer if user is logged in and window is focused
    const currentUser = this.authService.getCurrentUser();
    if (currentUser && this.isWindowFocused) {
      console.log('Starting session timeout timer for', this.SESSION_TIMEOUT / 1000 / 60, 'minutes');
      this.timeoutTimer = setTimeout(() => {
        // Double-check that window is still not focused before timing out
        if (!this.isWindowFocused) {
          console.log('Window not focused, skipping session timeout');
          return;
        }
        this.handleSessionTimeout();
      }, this.SESSION_TIMEOUT);
    } else if (!this.isWindowFocused) {
      console.log('Window not focused, not starting session timeout timer');
    }
  }

  private setupActivityListeners() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const resetTimer = () => {
      // Only reset timer if user is logged in and window is focused
      const currentUser = this.authService.getCurrentUser();
      if (currentUser && currentUser.userId && this.isWindowFocused) {
        console.log('Activity detected, resetting session timeout timer');
        this.startTimeoutTimer();
      }
    };

    // Use capture phase but also listen during bubbling phase for better coverage
    events.forEach(event => {
      document.addEventListener(event, resetTimer, true);
      document.addEventListener(event, resetTimer, false);
    });

    // Also listen for window focus events to handle tab switching
    window.addEventListener('focus', () => {
      console.log('Window focused, resuming session timeout');
      this.isWindowFocused = true;
      const currentUser = this.authService.getCurrentUser();
      if (currentUser && currentUser.userId && !this.sessionExpiredSubject.value) {
        // Reset timer when window regains focus
        this.startTimeoutTimer();
      }
    });

    // Prevent session timeout when window loses focus (switching tabs)
    window.addEventListener('blur', () => {
      console.log('Window blurred, pausing session timeout');
      this.isWindowFocused = false;
      // Clear the current timer when window loses focus
      if (this.timeoutTimer) {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = null;
      }
    });
  }

  private handleSessionTimeout() {
    console.log('Session timeout triggered');

    // Clear user session
    this.authService.logout();

    // Always show the session expired modal (don't auto-redirect)
    // The modal allows user to acknowledge and then redirects
    console.log('Showing session expired modal');
    this.sessionExpiredSubject.next(true);

    // Clear the timer
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }
  }

  public triggerSessionTimeout() {
    this.handleSessionTimeout();
  }

  public acknowledgeTimeout() {
    this.sessionExpiredSubject.next(false);

    // Navigate to appropriate login page based on current route
    const currentUrl = this.router.url;
    let loginRoute = '/candidate/sign-in';

    if (currentUrl.includes('/recruiter')) {
      loginRoute = '/recruiter/sign-in';
    } else if (currentUrl.includes('/admin')) {
      loginRoute = '/admin/sign-in';
    }

    this.router.navigate([loginRoute]);
  }

  public resetSessionTimeout() {
    this.startTimeoutTimer();
  }

  public isSessionExpired(): boolean {
    return this.sessionExpiredSubject.value;
  }
}
