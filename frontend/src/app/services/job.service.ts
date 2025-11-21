import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { ConfigService } from './config.service';

export interface Job {
  jobID: number;
  title: string;
  company: string;
  location: string;
  salary: string;
  remote: boolean;
  type: string;
  applicants: number;
  skills: string[];
  description: string;
  rating: number;
  posted: string;
  logo: string;
  priority: string;
  // optional fields used by recruiter UI
  status?: string;
  icon?: string;
  workMode?: string;
  tags?: { label: string; color?: string }[];
  requirements?: string[];
  benefits?: string[];
}

@Injectable({ providedIn: 'root' })
export class JobService {
  // BehaviorSubjects to store the latest jobs data
  private jobsSubject = new BehaviorSubject<Job[]>([]);
  private recruiterJobsSubject = new BehaviorSubject<Job[]>([]);

  // Observable streams that components can subscribe to
  public jobs$ = this.jobsSubject.asObservable();
  public recruiterJobs$ = this.recruiterJobsSubject.asObservable();

  // Refresh interval in milliseconds (e.g., every 30 seconds)
  private readonly refreshInterval = 30000;

  constructor(private http: HttpClient, private configService: ConfigService) {
    // Start periodic refresh for jobs
    this.startPeriodicRefresh();
  }

  private startPeriodicRefresh() {
    console.log('Starting periodic refresh');
    // Initial load
    this.refreshAllJobs();
    // Only refresh recruiter jobs if user is a recruiter
    this.checkAndRefreshRecruiterJobs();

    // Set up periodic refresh - refresh both but less frequently for recruiter jobs
    setInterval(() => {
      console.log('Running periodic refresh');
      this.refreshAllJobs();
    }, this.refreshInterval);

    // Separate interval for recruiter jobs (every 60 seconds) - only for recruiters
    setInterval(() => {
      console.log('Running recruiter jobs periodic refresh');
      this.checkAndRefreshRecruiterJobs();
    }, 60000);
  }

  private checkAndRefreshRecruiterJobs() {
    // Only refresh recruiter jobs if user is logged in and is a recruiter
    const userData = localStorage.getItem('optern_user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user && (user.role === 'recruiter' || user.role === 'admin')) {
          this.refreshRecruiterJobs();
        } else {
          console.log('Skipping recruiter jobs refresh - user is not a recruiter');
        }
      } catch (e) {
        console.log('Error parsing user data, skipping recruiter jobs refresh');
      }
    } else {
      console.log('No user data found, skipping recruiter jobs refresh');
    }
  }

  private refreshAllJobs() {
    console.log('Refreshing all jobs');
    this.getAllFromServer().subscribe({
      next: jobs => {
        console.log('Received all jobs:', jobs);
        this.jobsSubject.next(jobs);
      },
      error: error => {
        console.error('Error fetching all jobs:', error);
      }
    });
  }

  private refreshRecruiterJobs() {
    console.log('Refreshing recruiter jobs');
    this.getByRecruiterFromServer().subscribe({
      next: jobs => {
        console.log('Received recruiter jobs:', jobs);
        console.log('Number of recruiter jobs:', jobs?.length || 0);
        this.recruiterJobsSubject.next(jobs || []);
      },
      error: error => {
        console.error('Error fetching recruiter jobs:', error);
        console.error('Error details:', error.error || error.message);
        console.error('Full error object:', error);
        console.error('Error status:', error.status);
        console.error('Error statusText:', error.statusText);

        // Log authentication details for debugging
        const raw = localStorage.getItem('optern_user');
        if (raw) {
          try {
            const user = JSON.parse(raw);
            console.log('User in localStorage:', { email: user.email, hasToken: !!user.token, role: user.role });
          } catch (e) {
            console.error('Error parsing user from localStorage:', e);
          }
        } else {
          console.warn('No user data found in localStorage');
        }

        // Do NOT set empty array on error - keep current jobs to prevent flicker
        // Only log the error and let the UI retain current state
        console.warn('Keeping current jobs due to fetch error - not clearing the list');
      }
    });
  }

  private mapServerToUi(server: any): Job {
    const skillsArray = Array.isArray(server.skills)
      ? server.skills
      : (server.skills
        ? server.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
        : []);

    const posted = server.PostedDate || server.postedDate || server.Posted || server.posted
      ? new Date(server.PostedDate ?? server.postedDate ?? server.Posted ?? server.posted).toLocaleDateString()
      : new Date().toLocaleDateString();

    // Map workMode based on RemoteAllowed field
    const workMode = server.RemoteAllowed === true ? 'Remote' : 'Onsite';

    const mappedJob = {
      jobID: server.jobID ?? server.JobID ?? 0,
      title: server.title || server.Title || '',
      company: server.company?.name ?? server.Company?.Name ?? server.company ?? server.recruiter?.fullName ?? server.Recruiter?.FullName ?? 'Unknown Company',
      location: server.location ?? server.Location ?? 'Not specified',
      salary: server.salary ?? server.SalaryRange ?? 'Competitive',
      remote: server.remote ?? server.RemoteAllowed ?? false,
      type: server.type ?? server.EmploymentType ?? 'Full-time',
      applicants: server.applicants ?? 0,
      skills: skillsArray.length ? skillsArray : ['General'],
      description: server.description ?? server.Description ?? 'No description provided.',
      rating: server.rating ?? 4.5,
      posted: posted,
      logo: server.logo ?? 'https://i.imgur.com/2JV8V4A.png',
      priority: server.priority ?? server.category ?? server.Category ?? 'medium priority',
      // populate optional recruiter UI fields
      status: server.status ?? server.Status ?? 'active',
      icon: (server.title || server.Title || 'J').toString().charAt(0).toUpperCase(),
      workMode: workMode,
      tags: skillsArray.map((s: string) => ({ label: s, color: 'blue' })),
      requirements: server.requirements ?? (server.Requirements ? server.Requirements.split(',') : []) ?? [],
      benefits: server.benefits ?? (server.Benefits ? server.Benefits.split(',') : []) ?? []
    } as Job;

    return mappedJob;
  }

  // Server fetch methods
  private getAllFromServer(): Observable<Job[]> {
    console.log('Fetching all jobs from server');
    const jobsUrl = this.configService.getJobsUrl();
    return this.http.get<any>(jobsUrl).pipe(
      map(response => {
        console.log('Raw server response (all jobs):', response);
        console.log('Response type:', typeof response, 'isArray:', Array.isArray(response));

        let jobsArray: any[] = [];

        // Handle the same nested structure as recruiter jobs
        if (Array.isArray(response)) {
          jobsArray = response;
        } else if (response && typeof response === 'object') {
          // The backend returns { "$id": "1", "$values": [...] }
          let jobsData = response.$values || response.jobs || response.data || response.result || [];
          if (jobsData && Array.isArray(jobsData)) {
            jobsArray = jobsData;
          } else if (jobsData && jobsData.$values && Array.isArray(jobsData.$values)) {
            jobsArray = jobsData.$values;
          } else {
            console.warn('Jobs property is not an array or $values structure:', jobsData);
            jobsArray = [];
          }
        } else {
          console.warn('Unexpected response type for all jobs:', typeof response, response);
          jobsArray = [];
        }

        console.log('Jobs array to process:', jobsArray);

        return jobsArray
          .map(item => {
            try {
              const mappedJob = this.mapServerToUi(item);
              console.log('Mapped job:', mappedJob);
              return mappedJob;
            } catch (e) {
              console.error('Error mapping job:', item, e);
              return null;
            }
          })
          .filter(job => job != null) as Job[];
      })
    );
  }

  private getByRecruiterFromServer(): Observable<Job[]> {
    console.log('Fetching recruiter jobs from server');
    const jobsUrl = this.configService.getJobsUrl();
    return this.http.get<any>(`${jobsUrl}/by-recruiter`).pipe(
      map(response => {
        console.log('Raw server response (recruiter jobs):', response);
        console.log('Response type:', typeof response, 'isArray:', Array.isArray(response));
        let jobsArray: any[] = [];
        if (Array.isArray(response)) {
          jobsArray = response;
        } else if (response && typeof response === 'object') {
          // The backend returns { success: true, jobs: { "$id": "2", "$values": [...] }, count: number }
          let jobsData = response.jobs || response.data || response.result || [];
          if (jobsData && jobsData.$values && Array.isArray(jobsData.$values)) {
            jobsArray = jobsData.$values;
          } else if (Array.isArray(jobsData)) {
            jobsArray = jobsData;
          } else {
            console.warn('Jobs property is not an array or $values structure:', jobsData);
            jobsArray = [];
          }
        } else {
          console.warn('Unexpected response type for recruiter jobs:', typeof response, response);
        }
        console.log('Jobs array to map:', jobsArray);
        return jobsArray.map((item: any) => {
          try {
            const mappedJob = this.mapServerToUi(item);
            console.log('Mapped job:', mappedJob);
            return mappedJob;
          } catch (e) {
            console.error('Error mapping job:', item, e);
            return null;
          }
        }).filter(job => job != null);
      })
    );
  }

  // Public methods that components should use
  getAll(): Observable<Job[]> {
    // Trigger a refresh
    this.refreshAllJobs();
    // Return the observable stream
    return this.jobs$;
  }

  getByRecruiter(): Observable<Job[]> {
    // Trigger a refresh
    this.refreshRecruiterJobs();
    // Return the observable stream
    return this.recruiterJobs$;
  }

  loadRecruiterJobs(): Observable<Job[]> {
    return this.getByRecruiterFromServer().pipe(
      tap(jobs => {
        this.recruiterJobsSubject.next(jobs || []);
      })
    );
  }

  get(id: number) {
    const jobsUrl = this.configService.getJobsUrl();
    return this.http.get<any>(`${jobsUrl}/${id}`).pipe(map(item => this.mapServerToUi(item)));
  }

  create(payload: any) {
    const jobsUrl = this.configService.getJobsUrl();
    return this.http.post<any>(jobsUrl, payload).pipe(
      map(response => {
        // Handle the backend response structure: { success: true, message: "...", job: jobDto, jobId: number }
        const jobData = response.job || response;
        return this.mapServerToUi(jobData);
      }),
      tap((createdJob) => {
        // Immediately add to recruiter jobs to prevent flicker
        const currentJobs = this.recruiterJobsSubject.value || [];
        this.recruiterJobsSubject.next([createdJob, ...currentJobs]);

        // Refresh all jobs immediately for other components
        this.refreshAllJobs();
      })
    );
  }

  update(id: number, payload: any) {
    const jobsUrl = this.configService.getJobsUrl();
    return this.http.put(`${jobsUrl}/${id}`, payload).pipe(
      tap(() => {
        // Refresh all jobs
        this.refreshAllJobs();

        // Update the specific job in recruiter jobs immediately
        const currentRecruiterJobs = this.recruiterJobsSubject.value || [];
        const updatedJobs = currentRecruiterJobs.map(job => {
          if (job.jobID === id) {
            // Map the payload fields to the job object
            return {
              ...job,
              title: payload.Title || job.title,
              location: payload.Location || job.location,
              description: payload.Description || job.description,
              salary: payload.SalaryRange || job.salary,
              type: payload.EmploymentType || job.type,
              remote: payload.RemoteAllowed !== undefined ? payload.RemoteAllowed : job.remote,
              workMode: payload.RemoteAllowed ? 'Remote' : 'Onsite',
              skills: payload.Skills ? payload.Skills.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0) : job.skills,
              tags: payload.Skills ? payload.Skills.split(',').map((s: string) => ({ label: s.trim(), color: 'blue' })).filter((tag: any) => tag.label.length > 0) : job.tags
            };
          }
          return job;
        });
        this.recruiterJobsSubject.next(updatedJobs);
      })
    );
  }

  delete(id: number) {
    const jobsUrl = this.configService.getJobsUrl();
    return this.http.delete(`${jobsUrl}/${id}`).pipe(
      tap(() => {
        // Refresh all jobs
        this.refreshAllJobs();

        // Immediately remove the deleted job from recruiter jobs to prevent flicker
        const currentRecruiterJobs = this.recruiterJobsSubject.value || [];
        const updatedJobs = currentRecruiterJobs.filter(job => job.jobID !== id);
        this.recruiterJobsSubject.next(updatedJobs);
      })
    );
  }
}
