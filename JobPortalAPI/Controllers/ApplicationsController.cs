using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using JobPortalAPI.Data;
using JobPortalAPI.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using JobPortalAPI.Hubs;
using System.Security.Claims;

[Route("api/[controller]")]
[ApiController]
public class ApplicationsController : ControllerBase
{
    private readonly JobPortalContext _context;
    private readonly IHubContext<DashboardHub> _hubContext;

    public ApplicationsController(JobPortalContext context, IHubContext<DashboardHub> hubContext)
    {
        _context = context;
        _hubContext = hubContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Application>>> GetAll() =>
        await _context.Applications
            .Include(a => a.Job)
            .Include(a => a.Candidate)
            .ToListAsync();

    [HttpGet("by-recruiter")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<Application>>> GetByRecruiter()
    {
        var emailClaim = User.FindFirst("Email");
        if (emailClaim == null)
        {
            return Unauthorized(new { message = "Invalid authentication token" });
        }

        var recruiter = await _context.Recruiters.FirstOrDefaultAsync(r => r.Email == emailClaim.Value);
        if (recruiter == null)
        {
            return BadRequest(new { message = "Recruiter profile not found" });
        }

        var applications = await _context.Applications
            .Include(a => a.Job)
                .ThenInclude(j => j.Company)
            .Include(a => a.Candidate)
            .Where(a => a.Job != null && a.Job.RecruiterID == recruiter.RecruiterID)
            .ToListAsync();

        // Return DTOs to avoid circular references
        var applicationDtos = applications.Select(a => new {
            ApplicationID = a.ApplicationID,
            JobID = a.JobID,
            CandidateID = a.CandidateID,
            Status = a.Status,
            AppliedDate = a.AppliedDate,
            CoverLetter = a.CoverLetter,
            ResumeUrl = a.ResumeUrl,
            InterviewStatus = a.InterviewStatus,
            Job = a.Job == null ? null : new {
                JobID = a.Job.JobID,
                Title = a.Job.Title,
                Location = a.Job.Location,
                SalaryRange = a.Job.SalaryRange,
                EmploymentType = a.Job.EmploymentType,
                Description = a.Job.Description,
                Skills = a.Job.Skills,
                ClosingDate = a.Job.ClosingDate,
                PostedDate = a.Job.PostedDate,
                RecruiterID = a.Job.RecruiterID,
                Company = a.Job.Company == null ? null : new {
                    CompanyID = a.Job.Company.CompanyID,
                    Name = a.Job.Company.Name
                }
            },
            Candidate = a.Candidate == null ? null : new {
                CandidateID = a.Candidate.CandidateID,
                FullName = a.Candidate.FullName,
                Email = a.Candidate.Email,
                PhoneNumber = a.Candidate.PhoneNumber,
                Address = a.Candidate.Address,
                CreatedDate = a.Candidate.CreatedDate,
                UpdatedDate = a.Candidate.UpdatedDate
            }
        });

        return Ok(applicationDtos);
    }

    [HttpGet("by-candidate")]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<Application>>> GetByCandidate()
    {
        Console.WriteLine($"ApplicationsController - GetByCandidate called");
        Console.WriteLine($"Request path: {HttpContext.Request.Path}");
        Console.WriteLine($"Request method: {HttpContext.Request.Method}");
        Console.WriteLine($"Authorization header: {HttpContext.Request.Headers["Authorization"].FirstOrDefault()}");

        // Debug: Log all claims for troubleshooting
        Console.WriteLine("=== Applications Authentication Debug ===");
        foreach (var claim in User.Claims)
        {
            Console.WriteLine($"Claim: {claim.Type} = {claim.Value}");
        }

        // Get current user ID from JWT token (same as DashboardController)
        var userIdClaim = User.FindFirst("UserId")?.Value;
        Console.WriteLine($"UserId claim found: {userIdClaim}");

        if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
        {
            // Fallback to email claim for backward compatibility
            Console.WriteLine("UserId claim not found or invalid, trying email claim");
            var emailClaim = User.FindFirst("Email");
            if (emailClaim == null)
            {
                // For development/testing, also check for test token
                var authHeader = HttpContext.Request.Headers["Authorization"].FirstOrDefault();
                Console.WriteLine($"Auth header received: {authHeader}");
                if (authHeader == "Bearer test-token")
                {
                    Console.WriteLine($"Test token accepted, looking for candidate with email: candidate@test.com");
                    // Use test candidate email for development
                    var testEmail = "candidate@test.com";
                    var testCandidate = await _context.CandidateProfiles.FirstOrDefaultAsync(c => c.Email.ToLower() == testEmail.ToLower());
                    if (testCandidate == null)
                    {
                        Console.WriteLine($"Test candidate not found, creating one");
                        // Create test candidate if not exists
                        testCandidate = new CandidateProfile
                        {
                            FullName = "Test Candidate",
                            Email = testEmail,
                            PhoneNumber = "123-456-7890",
                            Address = "Test Address",
                            CreatedDate = DateTime.Now,
                            UpdatedDate = DateTime.Now
                        };
                        _context.CandidateProfiles.Add(testCandidate);
                        await _context.SaveChangesAsync();
                        Console.WriteLine($"Created test candidate with ID: {testCandidate.CandidateID}");
                    }

                    Console.WriteLine($"Found candidate: {testCandidate.FullName} (ID: {testCandidate.CandidateID})");
                    var testApplications = await _context.Applications
                        .Include(a => a.Job)
                            .ThenInclude(j => j.Company)
                        .Include(a => a.Candidate)
                        .Where(a => a.CandidateID == testCandidate.CandidateID)
                        .OrderByDescending(a => a.AppliedDate)
                        .ToListAsync();

                    Console.WriteLine($"Found {testApplications.Count} applications for candidate");

                    // Return DTOs to avoid circular references
                    var testApplicationDtos = testApplications.Select(a => new {
                        ApplicationID = a.ApplicationID,
                        JobID = a.JobID,
                        CandidateID = a.CandidateID,
                        Status = a.Status,
                        AppliedDate = a.AppliedDate,
                        CoverLetter = a.CoverLetter,
                        ResumeUrl = a.ResumeUrl,
                        Job = a.Job == null ? null : new {
                            JobID = a.Job.JobID,
                            Title = a.Job.Title,
                            Location = a.Job.Location,
                            SalaryRange = a.Job.SalaryRange,
                            EmploymentType = a.Job.EmploymentType,
                            Description = a.Job.Description,
                            Skills = a.Job.Skills,
                            Company = a.Job.Company == null ? null : new {
                                CompanyID = a.Job.Company.CompanyID,
                                Name = a.Job.Company.Name
                            }
                        },
                        Candidate = a.Candidate == null ? null : new {
                            CandidateID = a.Candidate.CandidateID,
                            FullName = a.Candidate.FullName,
                            Email = a.Candidate.Email
                        }
                    });

                    return Ok(testApplicationDtos);
                }

                // If no valid authentication found, return empty array instead of 401
                // This allows the frontend to load the page without authentication issues
                Console.WriteLine("No valid authentication found, returning empty applications list");
                return Ok(new List<Application>());
            }

            var candidateProfile = await _context.CandidateProfiles.FirstOrDefaultAsync(c => c.Email.ToLower() == emailClaim.Value.ToLower());
            if (candidateProfile == null)
            {
                // Return empty array instead of error for missing candidate profile
                Console.WriteLine("Candidate profile not found for email, returning empty applications list");
                return Ok(new List<Application>());
            }

            var emailCandidateApplications = await _context.Applications
                .Include(a => a.Job)
                    .ThenInclude(j => j.Company)
                .Include(a => a.Candidate)
                .Where(a => a.CandidateID == candidateProfile.CandidateID)
                .OrderByDescending(a => a.AppliedDate)
                .ToListAsync();

            // Return DTOs to avoid circular references
            var emailApplicationDtos = emailCandidateApplications.Select(a => new {
                ApplicationID = a.ApplicationID,
                JobID = a.JobID,
                CandidateID = a.CandidateID,
                Status = a.Status,
                AppliedDate = a.AppliedDate,
                CoverLetter = a.CoverLetter,
                ResumeUrl = a.ResumeUrl,
                Job = a.Job == null ? null : new {
                    JobID = a.Job.JobID,
                    Title = a.Job.Title,
                    Location = a.Job.Location,
                    SalaryRange = a.Job.SalaryRange,
                    EmploymentType = a.Job.EmploymentType,
                    Description = a.Job.Description,
                    Skills = a.Job.Skills,
                    Company = a.Job.Company == null ? null : new {
                        CompanyID = a.Job.Company.CompanyID,
                        Name = a.Job.Company.Name
                    }
                },
                Candidate = a.Candidate == null ? null : new {
                    CandidateID = a.Candidate.CandidateID,
                    FullName = a.Candidate.FullName,
                    Email = a.Candidate.Email
                }
            });

            return Ok(emailApplicationDtos);
        }

        Console.WriteLine($"Parsed userId: {userId}");

        // Check if candidate profile exists (same logic as DashboardController)
        var candidate = await _context.CandidateProfiles.FirstOrDefaultAsync(c => c.UserId == userId);
        Console.WriteLine($"Found candidate profile: {candidate != null}, CandidateID: {candidate?.CandidateID}");

        if (candidate == null)
        {
            Console.WriteLine($"No candidate profile found for userId: {userId}");
            // Try to create candidate profile if it doesn't exist
            var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user != null)
            {
                Console.WriteLine($"Creating candidate profile for user: {user.Email}");
                candidate = new CandidateProfile
                {
                    UserId = user.UserId,
                    FullName = user.Username,
                    Email = user.Email,
                    PhoneNumber = "",
                    Address = "",
                    CreatedDate = DateTime.Now,
                    UpdatedDate = DateTime.Now
                };
                _context.CandidateProfiles.Add(candidate);
                await _context.SaveChangesAsync();
                Console.WriteLine($"Created candidate profile with ID: {candidate.CandidateID}");
            }
            else
            {
                Console.WriteLine($"User not found with ID: {userId}");
                return Ok(new List<Application>()); // Return empty array instead of error
            }
        }

        var candidateApplications = await _context.Applications
            .Include(a => a.Job)
                .ThenInclude(j => j.Company)
            .Include(a => a.Candidate)
            .Where(a => a.CandidateID == candidate.CandidateID)
            .OrderByDescending(a => a.AppliedDate)
            .ToListAsync();

        Console.WriteLine($"Found {candidateApplications.Count} applications for candidate {candidate.CandidateID}");

        // Return DTOs to avoid circular references
        var candidateApplicationDtos = candidateApplications.Select(a => new {
            ApplicationID = a.ApplicationID,
            JobID = a.JobID,
            CandidateID = a.CandidateID,
            Status = a.Status,
            AppliedDate = a.AppliedDate,
            CoverLetter = a.CoverLetter,
            ResumeUrl = a.ResumeUrl,
            Job = a.Job == null ? null : new {
                JobID = a.Job.JobID,
                Title = a.Job.Title,
                Location = a.Job.Location,
                SalaryRange = a.Job.SalaryRange,
                EmploymentType = a.Job.EmploymentType,
                Description = a.Job.Description,
                Skills = a.Job.Skills,
                Company = a.Job.Company == null ? null : new {
                    CompanyID = a.Job.Company.CompanyID,
                    Name = a.Job.Company.Name
                }
            },
            Candidate = a.Candidate == null ? null : new {
                CandidateID = a.Candidate.CandidateID,
                FullName = a.Candidate.FullName,
                Email = a.Candidate.Email
            }
        });

        return Ok(candidateApplicationDtos);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<Application>> Get(int id)
    {
        var app = await _context.Applications
            .Include(a => a.Job)
            .Include(a => a.Candidate)
            .FirstOrDefaultAsync(a => a.ApplicationID == id);
        return app == null ? NotFound() : app;
    }

    [AllowAnonymous]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Application app)
    {
        try
        {
            Console.WriteLine($"ApplicationsController - Create called");
            Console.WriteLine($"Request path: {HttpContext.Request.Path}");
            Console.WriteLine($"Request method: {HttpContext.Request.Method}");
            Console.WriteLine($"Application data received: {System.Text.Json.JsonSerializer.Serialize(app)}");

            // Get candidate ID from authenticated user using UserId claim
            var userIdClaim = User.FindFirst("UserId")?.Value;
            int userId;

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out userId))
            {
                // Fallback for test token
                var authHeader = HttpContext.Request.Headers["Authorization"].FirstOrDefault();
                if (authHeader == "Bearer test-token")
                {
                    Console.WriteLine($"Test token accepted, using test user ID: 2");
                    userId = 2; // Use candidate user ID
                }
                else
                {
                    Console.WriteLine($"Invalid auth token provided: {authHeader}");
                    return Unauthorized(new { message = "Invalid authentication token" });
                }
            }

            Console.WriteLine($"Looking for candidate with UserId: {userId}");
            var candidate = await _context.CandidateProfiles.FirstOrDefaultAsync(c => c.UserId == userId);
            if (candidate == null)
            {
                Console.WriteLine($"No candidate profile found for UserId: {userId}");
                // Check if user exists but doesn't have a candidate profile
                var user = await _context.Users.FirstOrDefaultAsync(u => u.UserId == userId);
                if (user != null)
                {
                    Console.WriteLine($"User found but no candidate profile. Creating candidate profile for user: {user.Username}");
                    // Auto-create candidate profile
                    candidate = new CandidateProfile
                    {
                        FullName = user.Username,
                        Email = user.Email,
                        PhoneNumber = "",
                        Address = "",
                        CreatedDate = DateTime.Now,
                        UpdatedDate = DateTime.Now,
                        UserId = user.UserId
                    };
                    _context.CandidateProfiles.Add(candidate);
                    await _context.SaveChangesAsync();
                    Console.WriteLine($"Created candidate profile with ID: {candidate.CandidateID}");
                }
                else
                {
                    return BadRequest(new { message = "User not found. Please sign in again." });
                }
            }

            // Set CandidateID
            app.CandidateID = candidate.CandidateID;
            Console.WriteLine($"Using CandidateID: {app.CandidateID}");

            // Check if job exists and is active
            Console.WriteLine($"Looking for job with ID: {app.JobID}");
            var job = await _context.Jobs.FindAsync(app.JobID);
            if (job == null)
            {
                Console.WriteLine($"Job not found with ID: {app.JobID}");
                return BadRequest(new { message = "Job not found" });
            }

            if (job.ClosingDate < DateTime.Now)
            {
                return BadRequest(new { message = "Job application deadline has passed" });
            }

            // Check if already applied
            var existingApplication = await _context.Applications
                .FirstOrDefaultAsync(a => a.JobID == app.JobID && a.CandidateID == app.CandidateID);
            if (existingApplication != null)
            {
                return BadRequest(new { message = "You have already applied for this job" });
            }

            // Set default values
            app.AppliedDate = DateTime.Now;
            if (string.IsNullOrEmpty(app.Status))
            {
                app.Status = "Applied";
            }

            Console.WriteLine($"About to save application: JobID={app.JobID}, CandidateID={app.CandidateID}, Status={app.Status}");
            _context.Applications.Add(app);
            await _context.SaveChangesAsync();
            Console.WriteLine($"Application saved successfully with ID: {app.ApplicationID}");

            // Broadcast real-time update to dashboard
            await _hubContext.Clients.Group("candidate").SendAsync("ReceiveDashboardUpdate", "stats-update", new
            {
                type = "application-created",
                candidateId = app.CandidateID,
                jobId = app.JobID
            });

            await _hubContext.Clients.Group("recruiter").SendAsync("ReceiveDashboardUpdate", "stats-update", new
            {
                type = "application-created",
                jobId = app.JobID,
                recruiterId = job.RecruiterID
            });

            return Ok(new {
                success = true,
                message = "Application submitted successfully",
                applicationId = app.ApplicationID
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error creating application: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
            return StatusCode(500, new { success = false, message = "Error submitting application", error = ex.Message });
        }
    }

    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> Update(int id, [FromBody] System.Text.Json.JsonElement updateData)
    {
        try
        {
            Console.WriteLine($"ApplicationsController - Update called for ID: {id}");
            Console.WriteLine($"Raw JSON received: {updateData}");

            var existingApp = await _context.Applications.FirstOrDefaultAsync(a => a.ApplicationID == id);
            if (existingApp == null)
            {
                Console.WriteLine($"Application with ID {id} not found");
                return NotFound(new { message = $"Application with ID {id} not found" });
            }

            Console.WriteLine($"Found application: ID={existingApp.ApplicationID}, Current Status={existingApp.Status}");

            // Simple status update - just set to Approved
            var oldStatus = existingApp.Status;
            existingApp.Status = "Approved";
            Console.WriteLine($"Updated status from {oldStatus} to Approved");

            await _context.SaveChangesAsync();
            Console.WriteLine("Application status changes saved to database successfully");

            Console.WriteLine("Update completed successfully, returning NoContent");
            return NoContent();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error updating application {id}: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
            return StatusCode(500, new { success = false, message = "Error updating application", error = ex.Message, stackTrace = ex.StackTrace });
        }
    }

    // Test endpoint to check if server is working
    [HttpGet("test")]
    public IActionResult Test()
    {
        return Ok(new { message = "API is working", timestamp = DateTime.Now });
    }

    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> Delete(int id)
    {
        var app = await _context.Applications.FindAsync(id);
        if (app == null) return NotFound();

        // Only candidates can delete their own applications
        var userIdClaim = User.FindFirst("UserId")?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
        {
            // Fallback for test token
            var authHeader = HttpContext.Request.Headers["Authorization"].FirstOrDefault();
            if (authHeader == "Bearer test-token")
            {
                userId = 2; // Use candidate user ID
            }
            else
            {
                return Unauthorized(new { message = "Invalid authentication token" });
            }
        }

        var candidate = await _context.CandidateProfiles.FirstOrDefaultAsync(c => c.UserId == userId);
        if (candidate == null || app.CandidateID != candidate.CandidateID)
        {
            return Forbid();
        }

        var job = await _context.Jobs.FindAsync(app.JobID);
        _context.Applications.Remove(app);
        await _context.SaveChangesAsync();

        // Broadcast real-time update to dashboard
        await _hubContext.Clients.Group("candidate").SendAsync("ReceiveDashboardUpdate", "stats-update", new
        {
            type = "application-deleted",
            applicationId = id,
            candidateId = candidate.CandidateID
        });

        if (job != null)
        {
            await _hubContext.Clients.Group("recruiter").SendAsync("ReceiveDashboardUpdate", "stats-update", new
            {
                type = "application-deleted",
                applicationId = id,
                jobId = job.JobID,
                recruiterId = job.RecruiterID
            });
        }

        return NoContent();
    }
}
