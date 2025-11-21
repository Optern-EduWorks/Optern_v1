using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using JobPortalAPI.Data;
using JobPortalAPI.Models;
using BCrypt.Net;
using Newtonsoft.Json.Linq;
using System.IO;

public class UserRegistrationDto
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string VerificationStatus { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? CompanyName { get; set; }
    public string? CompanyWebsite { get; set; }
}

public class RecruiterRegistrationDto
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string VerificationStatus { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string? CompanyName { get; set; }
    public string? CompanyWebsite { get; set; }
}

[Route("api/[controller]")]
[ApiController]
public class UsersController : ControllerBase
{
    private readonly JobPortalContext _context;
    public UsersController(JobPortalContext context) => _context = context;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<User>>> GetUsers() =>
        await _context.Users.ToListAsync();

    [HttpGet("{id}")]
    public async Task<ActionResult<User>> GetUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        return user == null ? NotFound() : user;
    }

    [HttpPost]
    public async Task<ActionResult<User>> CreateUser([FromBody] UserRegistrationDto registration)
    {
        // Create user from registration data
        var user = new User
        {
            Username = registration.Username,
            Email = registration.Email,
            Password = registration.Password,
            Role = registration.Role,
            Status = registration.Status,
            VerificationStatus = registration.VerificationStatus,
            PhoneNumber = registration.PhoneNumber,
            CreatedAt = registration.CreatedAt ?? DateTime.Now,
            UpdatedAt = registration.UpdatedAt ?? DateTime.Now
        };

        Console.WriteLine($"Extracted role: '{user.Role}'");

        // Hash the password immediately for security
        if (!string.IsNullOrEmpty(user.Password))
        {
            user.Password = BCrypt.Net.BCrypt.HashPassword(user.Password);
        }

        // Set default values
        if (string.IsNullOrEmpty(user.Status))
        {
            user.Status = "Active";
        }
        if (string.IsNullOrEmpty(user.VerificationStatus))
        {
            user.VerificationStatus = "Pending";
        }

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Handle recruiter registration with company information
        if (user.Role != null && user.Role.Contains("Recruiter", StringComparison.OrdinalIgnoreCase))
        {
            await HandleRecruiterRegistrationAsync(user, registration.CompanyName, registration.CompanyWebsite);
        }
        // Handle candidate registration with profile creation
        else if (user.Role != null && (user.Role.Contains("Candidate", StringComparison.OrdinalIgnoreCase) || user.Role.Contains("student", StringComparison.OrdinalIgnoreCase)))
        {
            await HandleCandidateRegistrationAsync(user, registration);
        }

        // Remove password from response for security
        user.Password = string.Empty;

        return CreatedAtAction(nameof(GetUser), new { id = user.UserId }, user);
    }

    [HttpPost("register-recruiter")]
    public async Task<ActionResult<User>> RegisterRecruiter([FromBody] RecruiterRegistrationDto registration)
    {
        // Create user from registration data
        var user = new User
        {
            Username = registration.Username,
            Email = registration.Email,
            Password = registration.Password,
            Role = registration.Role,
            Status = registration.Status,
            VerificationStatus = registration.VerificationStatus,
            PhoneNumber = registration.PhoneNumber,
            CreatedAt = registration.CreatedAt,
            UpdatedAt = registration.UpdatedAt
        };

        // Hash the password immediately for security
        if (!string.IsNullOrEmpty(user.Password))
        {
            user.Password = BCrypt.Net.BCrypt.HashPassword(user.Password);
        }

        // Set default values
        if (string.IsNullOrEmpty(user.Status))
        {
            user.Status = "Active";
        }
        if (string.IsNullOrEmpty(user.VerificationStatus))
        {
            user.VerificationStatus = "Pending";
        }

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // Handle recruiter registration with company information
        await HandleRecruiterRegistrationAsync(user, registration.CompanyName, registration.CompanyWebsite);

        // Remove password from response for security
        user.Password = string.Empty;

        return CreatedAtAction(nameof(GetUser), new { id = user.UserId }, user);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateUser(int id, User user)
    {
        if (id != user.UserId) return BadRequest();
        _context.Entry(user).State = EntityState.Modified;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user == null) return NotFound();
        _context.Users.Remove(user);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("by-email/{email}")]
    public async Task<IActionResult> DeleteUserByEmail(string email)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user == null) return NotFound(new { message = $"User with email {email} not found" });

        // Also delete associated recruiter profile if it exists
        var recruiter = await _context.Recruiters.FirstOrDefaultAsync(r => r.Email == email);
        if (recruiter != null)
        {
            _context.Recruiters.Remove(recruiter);
        }

        // Also delete associated candidate profile if it exists
        var candidateProfile = await _context.CandidateProfiles.FirstOrDefaultAsync(cp => cp.Email == email);
        if (candidateProfile != null)
        {
            _context.CandidateProfiles.Remove(candidateProfile);
        }

        _context.Users.Remove(user);
        await _context.SaveChangesAsync();

        return Ok(new { message = $"User {email} and associated profiles deleted successfully" });
    }

    [HttpPost("fix-passwords")]
    public async Task<IActionResult> FixPlainTextPasswords()
    {
        try
        {
            // Find users with plain text passwords (not starting with $2)
            var usersWithPlainTextPasswords = await _context.Users
                .Where(u => !string.IsNullOrEmpty(u.Password) && !u.Password.StartsWith("$2"))
                .ToListAsync();

            Console.WriteLine($"Found {usersWithPlainTextPasswords.Count} users with plain text passwords");

            foreach (var user in usersWithPlainTextPasswords)
            {
                Console.WriteLine($"Fixing password for user: {user.Email}");
                // Hash the plain text password
                user.Password = BCrypt.Net.BCrypt.HashPassword(user.Password);
                user.UpdatedAt = DateTime.Now;
            }

            await _context.SaveChangesAsync();

            return Ok(new {
                message = "Passwords fixed successfully",
                fixedCount = usersWithPlainTextPasswords.Count
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error fixing passwords", error = ex.Message });
        }
    }

    private async Task HandleRecruiterRegistrationAsync(User user, string? companyName, string? companyWebsite)
    {
        Console.WriteLine($"Handling recruiter registration for user: {user.Email} with company: {companyName}");

        Company? company = null;

        // Create company if company name was provided
        if (!string.IsNullOrWhiteSpace(companyName))
        {
            // Get or create default industry
            var industry = await _context.Set<IndustryLookup>().FirstOrDefaultAsync();
            if (industry == null)
            {
                industry = new IndustryLookup { IndustryName = "Technology" };
                _context.Set<IndustryLookup>().Add(industry);
                await _context.SaveChangesAsync();
            }

            company = new Company
            {
                Name = companyName,
                Website = companyWebsite ?? "https://example.com",
                Size = "1-10", // Default size
                Address = "", // Empty address, can be filled later
                Phone = "",
                CreatedDate = DateTime.Now,
                IndustryID = industry.IndustryID
            };

            _context.Companies.Add(company);
            await _context.SaveChangesAsync();
            Console.WriteLine($"Created company '{companyName}' with ID: {company.CompanyID}");
        }
        else
        {
            // No company name provided, use default company
            company = await _context.Companies.FirstOrDefaultAsync();
            if (company == null)
            {
                // Get or create default industry
                var industry = await _context.Set<IndustryLookup>().FirstOrDefaultAsync();
                if (industry == null)
                {
                    industry = new IndustryLookup { IndustryName = "Technology" };
                    _context.Set<IndustryLookup>().Add(industry);
                    await _context.SaveChangesAsync();
                }

                company = new Company
                {
                    Name = "Default Company",
                    Website = "https://example.com",
                    Size = "1-10",
                    Address = "123 Main St",
                    Phone = "123-456-7890",
                    CreatedDate = DateTime.Now,
                    IndustryID = industry.IndustryID
                };
                _context.Companies.Add(company);
                await _context.SaveChangesAsync();
            }
        }

        // Create recruiter profile
        var recruiter = new Recruiter
        {
            FullName = user.Username,
            Email = user.Email,
            JobTitle = "Recruiter",
            CreatedDate = DateTime.Now,
            UpdatedDate = DateTime.Now,
            CompanyID = company.CompanyID
        };

        _context.Recruiters.Add(recruiter);
        await _context.SaveChangesAsync();

        Console.WriteLine($"Created recruiter profile for user {user.Email} with company '{company.Name}'");
    }

    private async Task HandleCandidateRegistrationAsync(User user, UserRegistrationDto registration)
    {
        Console.WriteLine($"Handling candidate registration for user: {user.Email}");

        // Check if candidate profile already exists
        var existingProfile = await _context.CandidateProfiles.FirstOrDefaultAsync(cp => cp.Email == user.Email);
        if (existingProfile != null)
        {
            Console.WriteLine($"Candidate profile already exists for user: {user.Email}");
            return;
        }

        // Create candidate profile with basic information from registration
        var candidateProfile = new CandidateProfile
        {
            CandidateID = user.UserId,
            FullName = user.Username ?? "",
            Email = user.Email,
            PhoneNumber = user.PhoneNumber ?? "",
            LinkedInProfile = "",
            Address = "",
            DateOfBirth = DateTime.MinValue, // Default date for no date of birth specified
            Gender = "",
            Status = "Active",
            ResumeURL = "",
            CreatedDate = DateTime.Now,
            UpdatedDate = DateTime.Now,
            GraduationYear = DateTime.Now.Year,
            College = "",
            Course = "",
            CurrentSemester = "",
            UserId = user.UserId
        };

        _context.CandidateProfiles.Add(candidateProfile);
        await _context.SaveChangesAsync();

        Console.WriteLine($"Created candidate profile for user {user.Email} with ID: {candidateProfile.CandidateID}");
    }
}
