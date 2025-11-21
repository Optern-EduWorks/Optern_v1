import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // import FormsModule
import { ApplicationService } from '../../services/application.service';
import { SignalRService } from '../../services/signalr.service';
import { AlertService } from '../../services/alert.service';
import { Subscription } from 'rxjs';

interface Application {
  id: number;
  name: string;
  role: string;
  company: string;
  initials: string;
  color: string;
  email: string;
  location: string;
  experience: string;
  applied: string;
  skills: string[];
  status: string;
  rating: number;
  education?: string;
  coverLetter?: string;
  phone?: string;
}

@Component({
  selector: 'app-applications-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recruiter-applications.html',
  styleUrls: ['./recruiter-applications.css']
})
export class ApplicationsManagementComponent implements OnInit, OnDestroy {
  search = "";
  filterStatus = "All Status";
  viewMode: 'grid' | 'list' = 'list';
  showDetailModal = false;
  showAnalyticsModal = false;
  selectedApplication?: Application;

  applications: any[] = [];

  // Alert system
  alerts: any[] = [];
  alertIdCounter = 0;

  private applicationService = inject(ApplicationService);
  private signalRService = inject(SignalRService);
  private alertService = inject(AlertService);
  private cdr = inject(ChangeDetectorRef);
  private subscription: Subscription = new Subscription();

  constructor() {
    this.loadApplications();
  }

  ngOnInit() {
    this.setupSignalR();
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  private async setupSignalR() {
    try {
      await this.signalRService.startConnection();
      console.log('SignalR connection established for recruiter applications');

      // Subscribe to dashboard updates
      this.subscription.add(
        this.signalRService.dashboardUpdates.subscribe(update => {
          if (update && update.data && (update.data.type === 'application-created' || update.data.type === 'application-status-updated' || update.data.type === 'application-deleted')) {
            console.log('Received application update:', update.data.type, 'refreshing applications');
            this.loadApplications();
          }
        })
      );
    } catch (error) {
      console.error('Error setting up SignalR connection:', error);
    }
  }

  private loadApplications() {
    console.log('Loading applications for recruiter...');
    this.applicationService.getByRecruiter().subscribe({
      next: (data) => {
        console.log('Received applications data:', data);
        // Map API data to expected format
        this.applications = (data || []).map(app => {
          const mappedApp = {
            id: app.ApplicationID,
            name: app.Candidate?.FullName || 'Unknown Candidate',
            role: app.Job?.Title || 'Unknown Position',
            company: app.Job?.Company?.Name || 'Unknown Company',
            initials: (app.Candidate?.FullName || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
            color: this.getRandomColor(),
            email: app.Candidate?.Email || '',
            location: app.Candidate?.Address || '',
            experience: 'Not specified', // Could be added to candidate profile later
            applied: new Date(app.AppliedDate).toLocaleDateString(),
            skills: [], // Could be added to candidate profile later
            status: app.Status,
            rating: 4, // Default rating, could be added to application model
            education: 'Not specified', // Could be added to candidate profile later
            coverLetter: app.CoverLetter || '',
            phone: app.Candidate?.PhoneNumber || '',
            applicationID: app.ApplicationID,
            jobID: app.JobID,
            candidateID: app.CandidateID,
            interviewStatus: app.InterviewStatus,
            resumeUrl: app.ResumeUrl
          };
          console.log('Mapped application:', mappedApp.name, '-> Role:', mappedApp.role, 'Company:', mappedApp.company);
          return mappedApp;
        });
        console.log('Total applications loaded:', this.applications.length);
      },
      error: (err) => {
        console.error('Failed to load applications', err);
        this.applications = [];
      }
    });
  }

  private getRandomColor(): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  get filteredApplications() {
    let filtered = this.applications;

    // Filter by status
    if (this.filterStatus !== "All Status") {
      filtered = filtered.filter(app => app.status === this.filterStatus);
    }

    // Filter by search term
    if (this.search.trim()) {
      const searchTerm = this.search.toLowerCase();
      filtered = filtered.filter(app =>
        app.name.toLowerCase().includes(searchTerm) ||
        app.email.toLowerCase().includes(searchTerm) ||
        app.role.toLowerCase().includes(searchTerm) ||
        app.company.toLowerCase().includes(searchTerm) ||
        app.location.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }

  openDetailModal(app: Application) {
    this.selectedApplication = app;
    this.showDetailModal = true;
  }
  closeDetailModal() {
    this.showDetailModal = false;
    this.selectedApplication = undefined;
  }
  openAnalyticsModal() {
    this.showAnalyticsModal = true;
  }
  closeAnalyticsModal() {
    this.showAnalyticsModal = false;
  }
  shortlist(app: Application | undefined): void {
    if (app) {
      // Update status in backend if application has id
      if ((app as any).applicationID) {
        const id = (app as any).applicationID;
        this.applicationService.update(id, { status: 'Shortlisted' }).subscribe({
          next: () => {
            (app as any).status = 'Shortlisted';
            this.alertService.success('Success', 'Candidate shortlisted successfully!');
          },
          error: (err) => {
            const errorMessage = err?.error?.message || err?.message || 'Unknown error occurred';
            this.alertService.error('Error', 'Failed to shortlist: ' + errorMessage);
          }
        });
      } else {
        (app as any).status = 'Shortlisted';
      }
    }
  }

  approve(app: Application | undefined): void {
    if (app) {
      console.log('Approving application:', app);
      // Update status in backend if application has id
      if ((app as any).applicationID) {
        const id = (app as any).applicationID;
        console.log('Sending approve request for application ID:', id, 'with payload:', { Status: 'Approved' });

        // Try with PascalCase Status first
        this.applicationService.update(id, { Status: 'Approved' }).subscribe({
          next: (response) => {
            console.log('Approve response:', response);
            (app as any).status = 'Approved';
            this.alertService.success('Success', 'Candidate approved successfully!');
          },
          error: (err) => {
            console.error('Approve error with PascalCase:', err);
            // Try with camelCase status as fallback
            console.log('Trying with camelCase status...');
            this.applicationService.update(id, { status: 'Approved' }).subscribe({
              next: (response) => {
                console.log('Approve response (camelCase):', response);
                (app as any).status = 'Approved';
                this.alertService.success('Success', 'Candidate approved successfully!');
              },
              error: (err2) => {
                console.error('Approve error with camelCase:', err2);
                const errorMessage = err2?.error?.message || err2?.message || 'Unknown error occurred';
                this.alertService.error('Error', 'Failed to approve: ' + errorMessage);
              }
            });
          }
        });
      } else {
        console.log('No applicationID found, updating locally only');
        (app as any).status = 'Approved';
      }
    } else {
      console.log('No application provided to approve method');
    }
  }

  updateStatus(app: Application | undefined, newStatus: string): void {
    if (app) {
      if ((app as any).applicationID) {
        const id = (app as any).applicationID;
        this.applicationService.update(id, { status: newStatus }).subscribe({
          next: () => {
            (app as any).status = newStatus;
            this.alertService.success('Success', `Application status updated to ${newStatus}!`);
          },
          error: (err) => {
            const errorMessage = err?.error?.message || err?.message || 'Unknown error occurred';
            this.alertService.error('Error', 'Failed to update status: ' + errorMessage);
          }
        });
      }
    }
  }

  scheduleInterview(app: Application): void {
    // Create a proper modal for scheduling interview
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.3);
      max-width: 400px;
      width: 90%;
      text-align: center;
    `;

    modalContent.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #1e293b; font-size: 18px; font-weight: 600;">Schedule Interview</h3>
      <p style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">Select date and time for the interview with ${app.name}</p>

      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; color: #374151; font-weight: 500; text-align: left;">Interview Date & Time</label>
        <input type="datetime-local" id="interview-datetime" style="
          width: 100%;
          padding: 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          box-sizing: border-box;
        " min="${new Date().toISOString().slice(0, 16)}">
      </div>

      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <button id="cancel-btn" style="
          padding: 10px 20px;
          border: 1px solid #d1d5db;
          background: white;
          color: #6b7280;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">Cancel</button>
        <button id="schedule-btn" style="
          padding: 10px 20px;
          border: none;
          background: #3b82f6;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">Schedule Interview</button>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Focus on datetime input
    setTimeout(() => {
      const datetimeInput = document.getElementById('interview-datetime') as HTMLInputElement;
      if (datetimeInput) datetimeInput.focus();
    }, 100);

    // Handle cancel
    document.getElementById('cancel-btn')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Handle schedule
    document.getElementById('schedule-btn')?.addEventListener('click', () => {
      const datetimeInput = document.getElementById('interview-datetime') as HTMLInputElement;
      const selectedDateTime = datetimeInput?.value;

      if (!selectedDateTime) {
        this.alertService.warning('Warning', 'Please select a date and time for the interview.');
        return;
      }

      const interviewDate = new Date(selectedDateTime);
      const now = new Date();

      if (interviewDate <= now) {
        this.alertService.warning('Warning', 'Please select a future date and time for the interview.');
        return;
      }

      // Close modal
      document.body.removeChild(modal);

      // Format the date nicely
      const formattedDate = interviewDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      if ((app as any).applicationID) {
        const id = (app as any).applicationID;
        this.applicationService.update(id, {
          status: 'Interview Scheduled',
          interviewStatus: `Interview scheduled for ${formattedDate}`
        }).subscribe({
          next: () => {
            (app as any).status = 'Interview Scheduled';
            (app as any).interviewStatus = `Interview scheduled for ${formattedDate}`;
            this.alertService.success('Success', `Interview scheduled for ${formattedDate}!`);
          },
          error: (err) => {
            const errorMessage = err?.error?.message || err?.message || 'Unknown error occurred';
            this.alertService.error('Error', 'Failed to schedule interview: ' + errorMessage);
          }
        });
      }
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  scheduleInterviewFromModal(app: Application | undefined): void {
    if (app) {
      this.scheduleInterview(app);
    }
  }

  downloadResume(app: Application | undefined): void {
    if (app) {
      // Check if resume URL exists
      if ((app as any).resumeUrl) {
        window.open((app as any).resumeUrl, '_blank');
        this.alertService.success('Success', 'Resume download initiated');
      } else {
        this.alertService.warning('Warning', 'Resume not available for this candidate');
      }
    }
  }

  contactCandidate(type: string, contact: string | undefined): void {
    if (!contact) {
      this.alertService.warning('Warning', 'Contact information not available');
      return;
    }

    if (type === 'email') {
      // Copy email to clipboard
      navigator.clipboard.writeText(contact).then(() => {
        this.alertService.success('Email Copied', `Email copied: ${contact}`);
      }).catch(() => {
        // Fallback - show DOM alert with contact info
        this.alertService.info('Email Address', contact);
      });
    } else if (type === 'phone') {
      // Copy phone to clipboard
      navigator.clipboard.writeText(contact).then(() => {
        this.alertService.success('Phone Copied', `Phone copied: ${contact}`);
      }).catch(() => {
        // Fallback - show DOM alert with contact info
        this.alertService.info('Phone Number', contact);
      });
    }
  }

  getStarRating(rating: number): string[] {
    const stars: string[] = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
      stars.push('bi-star-fill');
    }

    if (hasHalfStar) {
      stars.push('bi-star-half');
    }

    while (stars.length < 5) {
      stars.push('bi-star');
    }

    return stars;
  }


}
