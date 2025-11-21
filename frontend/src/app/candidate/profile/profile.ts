import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../services/profile.service';
import { AuthService } from '../../services/auth.service';
import { CandidateProfile } from '../../models/candidate-profile.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  // Property to track the active tab, initialized to 'personal'
  activeTab: string = 'personal';

  // Edit modes
  isEditMode: boolean = false;
  isAcademicEditMode: boolean = false;

  // Profile data
  profile: CandidateProfile = {
    candidateID: 0,
    fullName: '',
    email: '',
    phoneNumber: '',
    linkedInProfile: '',
    address: '',
    dateOfBirth: new Date(),
    gender: '',
    status: '',
    resumeURL: '',
    createdDate: new Date(),
    updatedDate: new Date(),
    graduationYear: 0,
    college: '',
    course: '',
    currentSemester: ''
  };

  // User's registration date (from auth service)
  userRegistrationDate: Date | null = null;

  // Form data for editing
  editProfile: CandidateProfile = { ...this.profile };

  // UI state
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  successMessage = '';

  // Notification settings
  notificationSettings = {
    emailNotifications: true,
    jobApplicationUpdates: true,
    interviewReminders: true,
    marketingCommunications: false
  };

  // Password management
  passwordData = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };

  // Password visibility toggles
  passwordVisibility = {
    current: false,
    new: false,
    confirm: false
  };

  // Active sessions modal
  showSessionsModal = false;
  activeSessions: any[] = [];

  constructor(
    public profileService: ProfileService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log('Profile component initialized');

    // Get user's registration date from auth service
    const currentUser = this.authService.getCurrentUser();
    this.userRegistrationDate = currentUser?.createdAt || null;

    this.loadProfile();
    // Listen for auth service changes to refresh profile when user logs in
    this.authService.currentUser$.subscribe(user => {
      console.log('Auth service user changed:', user);
      if (user && user.userId > 0) {
        console.log('Valid user logged in, refreshing profile...');
        this.userRegistrationDate = user.createdAt || null;
        this.forceReloadProfile();
      } else {
        console.log('User logged out or invalid user, clearing profile...');
        // Clear profile data when user logs out
        this.profile = this.getDefaultProfile();
        this.editProfile = { ...this.profile };
        this.userRegistrationDate = null;
      }
    });
  }

  // Method to refresh profile data (can be called after login)
  refreshProfile() {
    console.log('Refreshing profile...');
    this.loadProfile();
  }

  // Method to force reload profile (can be called from parent components)
  forceReloadProfile() {
    console.log('Force reloading profile...');
    this.isLoading = true;
    this.errorMessage = '';

    const currentUser = this.authService.getCurrentUser();
    console.log('Current user:', currentUser);

    if (currentUser && currentUser.userId) {
      // Use the main getProfile method instead of getProfileById
      this.profileService.getProfile().subscribe({
        next: (data: CandidateProfile | null) => {
          console.log('Profile force loaded:', data);
          if (data) {
            this.profile = data;
            this.editProfile = { ...data };
          } else {
            this.profile = this.getDefaultProfile();
            this.editProfile = { ...this.profile };
          }
          this.isLoading = false;
        },
        error: (error: any) => {
          console.error('Error force loading profile:', error);
          this.errorMessage = `Failed to load profile: ${error.message || 'Please try again.'}`;
          this.isLoading = false;
          // Use default profile on error
          this.profile = this.getDefaultProfile();
          this.editProfile = { ...this.profile };
        }
      });
    } else {
      this.loadProfile();
    }
  }

  // Method to change the active tab
  selectTab(tab: string) {
    this.activeTab = tab;
    this.clearMessages();
    // Reset edit modes when switching tabs
    this.isEditMode = false;
    this.isAcademicEditMode = false;
  }

  // Method to set active tab (used by HTML template)
  setActiveTab(tab: string): void {
    this.selectTab(tab);
  }

  // Toggle edit mode for personal information
  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
  }

  // Toggle edit mode for academic information
  toggleAcademicEditMode(): void {
    this.isAcademicEditMode = !this.isAcademicEditMode;
  }

  // Cancel edit mode
  cancelEdit(): void {
    this.isEditMode = false;
    this.editProfile = { ...this.profile };
    this.clearMessages();
  }

  // Cancel academic edit mode
  cancelAcademicEdit(): void {
    this.isAcademicEditMode = false;
    this.editProfile = { ...this.profile };
    this.clearMessages();
  }

  // Load profile data
  loadProfile() {
    this.isLoading = true;
    this.errorMessage = '';

    console.log('Loading profile...');
    this.profileService.getProfile().subscribe({
      next: (data: CandidateProfile | null) => {
        console.log('Profile loaded:', data);
        if (data && data.candidateID && data.candidateID > 0) {
          this.profile = data;
          console.log('Using existing profile:', this.profile);
          // Always update basic fields with user signup details to ensure consistency
          const currentUser = this.authService.getCurrentUser();
          if (currentUser) {
            // Override profile fields with signup data
            this.profile.fullName = currentUser.username || this.profile.fullName;
            this.profile.email = currentUser.email || this.profile.email;
            this.profile.phoneNumber = currentUser.phoneNumber || this.profile.phoneNumber;
          }
          console.log('Profile after signup data override:', this.profile);
        } else {
          // No existing profile, pre-populate with user signup details
          const currentUser = this.authService.getCurrentUser();
          console.log('No profile found, pre-populating with user data:', currentUser);
          this.profile = this.getDefaultProfile();
          if (currentUser) {
            this.profile.fullName = currentUser.username || '';
            this.profile.email = currentUser.email || '';
            this.profile.phoneNumber = currentUser.phoneNumber || '';
          }
          console.log('Using pre-populated profile:', this.profile);
        }
        this.editProfile = { ...this.profile };
        // Update notification settings from profile
        this.notificationSettings = {
          emailNotifications: this.profile.emailNotifications ?? true,
          jobApplicationUpdates: this.profile.jobApplicationUpdates ?? true,
          interviewReminders: this.profile.interviewReminders ?? true,
          marketingCommunications: this.profile.marketingCommunications ?? false
        };
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading profile:', error);
        this.errorMessage = `Failed to load profile data: ${error.message || 'Please try again.'}`;
        this.isLoading = false;
        // Use default profile on error, but try to pre-populate with user data
        this.profile = this.getDefaultProfile();
        const currentUser = this.authService.getCurrentUser();
        if (currentUser) {
          this.profile.fullName = currentUser.username || '';
          this.profile.email = currentUser.email || '';
          this.profile.phoneNumber = currentUser.phoneNumber || '';
        }
        this.editProfile = { ...this.profile };
      }
    });
  }

  // Save profile data
  saveProfile() {
    console.log('Save profile called');
    console.log('Current editProfile:', this.editProfile);
    console.log('Current profile:', this.profile);

    // Ensure editProfile is initialized
    if (!this.editProfile) {
      console.error('editProfile is null, initializing with default');
      this.editProfile = this.getDefaultProfile();
    }

    if (!this.validateProfile()) {
      console.log('Profile validation failed');
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Ensure the profile has the current user's ID
    const currentUser = this.authService.getCurrentUser();
    console.log('Current user in saveProfile:', currentUser);

    if (!currentUser || !currentUser.userId) {
      console.error('No current user found');
      this.errorMessage = 'Please log in to save your profile';
      this.isSaving = false;
      return;
    }

    // Create a safe copy of the profile to avoid mutations
    // Ensure we have a valid profile object
    const baseProfile = this.editProfile || this.getDefaultProfile();

    const profileToSave: CandidateProfile = {
      ...baseProfile,
      candidateID: currentUser.userId,
      email: currentUser.email,
      updatedDate: new Date()
    };

    console.log('Profile to save:', profileToSave);

    this.profileService.updateProfile(profileToSave).subscribe({
      next: (data: CandidateProfile) => {
        console.log('Profile saved successfully:', data);

        // Update profile with the edited data (which contains the user's changes)
        // The server returns the same data we sent, so we use the editProfile data
        const updatedProfile = {
          ...data,
          fullName: this.editProfile.fullName,
          email: this.editProfile.email,
          phoneNumber: this.editProfile.phoneNumber,
          address: this.editProfile.address,
          linkedInProfile: this.editProfile.linkedInProfile,
          dateOfBirth: this.editProfile.dateOfBirth,
          gender: this.editProfile.gender,
          college: this.editProfile.college,
          course: this.editProfile.course,
          graduationYear: this.editProfile.graduationYear,
          currentSemester: this.editProfile.currentSemester,
          emailNotifications: this.editProfile.emailNotifications,
          jobApplicationUpdates: this.editProfile.jobApplicationUpdates,
          interviewReminders: this.editProfile.interviewReminders,
          marketingCommunications: this.editProfile.marketingCommunications
        };

        this.profile = { ...updatedProfile };
        this.editProfile = { ...updatedProfile };

        this.successMessage = 'Profile updated successfully!';
        this.isSaving = false;
        this.isEditMode = false; // Exit edit mode after successful save

        // Force change detection to ensure UI updates immediately
        this.cdr.detectChanges();

        // Update auth service user data with the current fullName and phoneNumber
        if (currentUser) {
          const updatedUser = {
            ...currentUser,
            username: data.fullName,
            phoneNumber: data.phoneNumber
          };
          console.log('Updating auth service with new username and phone number:', updatedUser.username, updatedUser.phoneNumber);
          this.authService.updateCurrentUser(updatedUser);
          console.log('Updated auth service and localStorage with new data');
        }

        setTimeout(() => this.clearMessages(), 3000);
      },
      error: (error: any) => {
        console.error('Error updating profile:', error);
        this.errorMessage = `Failed to update profile: ${error.message || 'Please try again.'}`;
        this.isSaving = false;
      }
    });
  }

  // Save academic information
  saveAcademicInfo() {
    console.log('Save academic info called');

    // Ensure editProfile is initialized
    if (!this.editProfile) {
      console.error('editProfile is null, initializing with default');
      this.editProfile = this.getDefaultProfile();
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Get current user
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !currentUser.userId) {
      this.errorMessage = 'Please log in to save your profile';
      this.isSaving = false;
      return;
    }

    // Create a safe copy for academic info update
    const profileToSave: CandidateProfile = {
      ...this.editProfile,
      candidateID: currentUser.userId,
      email: currentUser.email,
      updatedDate: new Date()
    };

    console.log('Saving academic info:', profileToSave);

    this.profileService.updateProfile(profileToSave).subscribe({
      next: (data: CandidateProfile) => {
        console.log('Academic info saved successfully:', data);

        // Update profile with the edited data (which contains the user's changes)
        const updatedProfile = {
          ...data,
          fullName: this.editProfile.fullName,
          email: this.editProfile.email,
          phoneNumber: this.editProfile.phoneNumber,
          address: this.editProfile.address,
          linkedInProfile: this.editProfile.linkedInProfile,
          dateOfBirth: this.editProfile.dateOfBirth,
          gender: this.editProfile.gender,
          college: this.editProfile.college,
          course: this.editProfile.course,
          graduationYear: this.editProfile.graduationYear,
          currentSemester: this.editProfile.currentSemester,
          emailNotifications: this.editProfile.emailNotifications,
          jobApplicationUpdates: this.editProfile.jobApplicationUpdates,
          interviewReminders: this.editProfile.interviewReminders,
          marketingCommunications: this.editProfile.marketingCommunications
        };

        this.profile = { ...updatedProfile };
        this.editProfile = { ...updatedProfile };

        this.successMessage = 'Academic information updated successfully!';
        this.isSaving = false;
        this.isAcademicEditMode = false; // Exit academic edit mode after successful save

        // Force change detection to ensure UI updates immediately
        this.cdr.detectChanges();

        // Update auth service user data with the current fullName and phoneNumber
        const currentUser = this.authService.getCurrentUser();
        if (currentUser) {
          const updatedUser = {
            ...currentUser,
            username: data.fullName,
            phoneNumber: data.phoneNumber
          };
          console.log('Updating auth service with new username and phone number:', updatedUser.username, updatedUser.phoneNumber);
          this.authService.updateCurrentUser(updatedUser);
          console.log('Updated auth service and localStorage with new data');
        }

        setTimeout(() => this.clearMessages(), 3000);
      },
      error: (error: any) => {
        console.error('Error updating academic info:', error);
        this.errorMessage = 'Failed to update academic information. Please try again.';
        this.isSaving = false;
      }
    });
  }

  // Save notification preferences
  saveNotificationPreferences() {
    console.log('Saving notification preferences:', this.notificationSettings);

    // Update the profile with notification settings
    this.editProfile.emailNotifications = this.notificationSettings.emailNotifications;
    this.editProfile.jobApplicationUpdates = this.notificationSettings.jobApplicationUpdates;
    this.editProfile.interviewReminders = this.notificationSettings.interviewReminders;
    this.editProfile.marketingCommunications = this.notificationSettings.marketingCommunications;

    // Save the profile
    this.saveProfile();
  }

  // Update password
  updatePassword() {
    if (!this.passwordData.currentPassword || !this.passwordData.newPassword || !this.passwordData.confirmPassword) {
      this.errorMessage = 'Please fill in all password fields.';
      return;
    }

    if (this.passwordData.newPassword !== this.passwordData.confirmPassword) {
      this.errorMessage = 'New password and confirmation do not match.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    console.log('Updating password for user');

    this.authService.changePassword(this.passwordData.currentPassword, this.passwordData.newPassword).subscribe({
      next: (response) => {
        console.log('Password updated successfully:', response);
        this.successMessage = 'Password updated successfully!';
        this.isSaving = false;
        // Clear password fields
        this.passwordData.currentPassword = '';
        this.passwordData.newPassword = '';
        this.passwordData.confirmPassword = '';
        setTimeout(() => this.clearMessages(), 3000);
      },
      error: (error) => {
        console.error('Error updating password:', error);
        this.errorMessage = error.error?.message || 'Failed to update password. Please try again.';
        this.isSaving = false;
      }
    });
  }

  // Toggle password visibility
  togglePasswordVisibility(field: 'current' | 'new' | 'confirm') {
    this.passwordVisibility[field] = !this.passwordVisibility[field];
  }

  // Validate profile data
  private validateProfile(): boolean {
    if (!this.editProfile.fullName?.trim()) {
      this.errorMessage = 'Full name is required.';
      return false;
    }
    if (!this.editProfile.email?.trim()) {
      this.errorMessage = 'Email is required.';
      return false;
    }
    if (!this.editProfile.phoneNumber?.trim()) {
      this.errorMessage = 'Phone number is required.';
      return false;
    }
    return true;
  }

  // Get default profile structure
  private getDefaultProfile(): CandidateProfile {
    return {
      candidateID: 0,
      fullName: '',
      email: '',
      phoneNumber: '',
      linkedInProfile: '',
      address: '',
      dateOfBirth: null, // No default date of birth - user must enter it
      gender: '',
      status: 'Active',
      resumeURL: '',
      createdDate: new Date(),
      updatedDate: new Date(),
      graduationYear: new Date().getFullYear(),
      college: '',
      course: '',
      currentSemester: ''
    };
  }

  // Clear messages
  private clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }

  // View active sessions
  viewActiveSessions() {
    // Call the real API to get active sessions
    this.authService.getActiveSessions().subscribe({
      next: (response: any) => {
        console.log('Active sessions response:', response);
        if (response && response.sessions) {
          this.activeSessions = response.sessions.map((session: any) => ({
            ...session,
            lastActive: new Date(session.lastActive)
          }));
          this.showSessionsModal = true;
        } else {
          console.error('Invalid sessions response:', response);
          this.errorMessage = 'Failed to load active sessions';
        }
      },
      error: (error: any) => {
        console.error('Error loading active sessions:', error);
        this.errorMessage = 'Failed to load active sessions. Please try again.';
      }
    });
  }

  // Close sessions modal
  closeSessionsModal() {
    this.showSessionsModal = false;
    this.activeSessions = [];
  }

  // Revoke a specific session
  revokeSession(session: any) {
    if (confirm(`Are you sure you want to revoke access for "${session.deviceName}"?`)) {
      this.authService.revokeSession(session.sessionId).subscribe({
        next: (response: any) => {
          console.log('Session revoked successfully:', response);
          // Remove the session from the local array
          this.activeSessions = this.activeSessions.filter(s => s.sessionId !== session.sessionId);
          this.successMessage = `Session for ${session.deviceName} has been revoked.`;
          setTimeout(() => this.clearMessages(), 3000);
        },
        error: (error: any) => {
          console.error('Error revoking session:', error);
          this.errorMessage = 'Failed to revoke session. Please try again.';
          setTimeout(() => this.clearMessages(), 3000);
        }
      });
    }
  }

  // Revoke all other sessions
  revokeAllSessions() {
    const otherSessions = this.activeSessions.filter(s => !s.isCurrent);
    if (otherSessions.length === 0) {
      alert('No other sessions to revoke.');
      return;
    }

    if (confirm(`Are you sure you want to revoke access for all ${otherSessions.length} other device(s)?`)) {
      this.authService.revokeAllSessions().subscribe({
        next: (response: any) => {
          console.log('All sessions revoked successfully:', response);
          // Keep only the current session
          this.activeSessions = this.activeSessions.filter(s => s.isCurrent);
          this.successMessage = `All other sessions have been revoked. You will remain logged in on this device.`;
          setTimeout(() => this.clearMessages(), 3000);
        },
        error: (error: any) => {
          console.error('Error revoking all sessions:', error);
          this.errorMessage = 'Failed to revoke sessions. Please try again.';
          setTimeout(() => this.clearMessages(), 3000);
        }
      });
    }
  }


}
