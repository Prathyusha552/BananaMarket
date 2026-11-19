
package com.bananamarket;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class AuthController {

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final SecurityContextRepository securityContextRepository =
        new HttpSessionSecurityContextRepository();

    public AuthController(
        JdbcTemplate jdbcTemplate,
        PasswordEncoder passwordEncoder
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM users",
            Integer.class
        );

        return Map.of("setupRequired", count == null || count == 0);
    }

    @PostMapping("/setup")
    public ResponseEntity<?> setup(
        @RequestBody AuthRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        if (request.username() == null ||
            !request.username().trim().equals("admin")) {
            return ResponseEntity.badRequest()
                .body(Map.of("message", "Username must be admin."));
        }

        if (request.password() == null ||
            request.password().length() < 10) {
            return ResponseEntity.badRequest()
                .body(Map.of(
                    "message",
                    "Password must contain at least 10 characters."
                ));
        }

        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM users",
            Integer.class
        );

        if (count != null && count > 0) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of(
                    "message",
                    "Administrator account has already been created."
                ));
        }

        String hash = passwordEncoder.encode(request.password());

        jdbcTemplate.update(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            "admin",
            hash,
            "ADMIN"
        );

        return loginAdmin("admin", request.password(), httpRequest, httpResponse);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
        @RequestBody AuthRequest request,
        HttpServletRequest httpRequest,
        HttpServletResponse httpResponse
    ) {
        if (request.username() == null || request.password() == null) {
            return ResponseEntity.badRequest()
                .body(Map.of("message", "Username and password are required."));
        }

        return loginAdmin(
            request.username().trim(),
            request.password(),
            httpRequest,
            httpResponse
        );
    }

    private ResponseEntity<?> loginAdmin(
        String username,
        String password,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        var users = jdbcTemplate.query(
            "SELECT username, password_hash, role FROM users WHERE username = ?",
            (rs, rowNum) -> new UserRecord(
                rs.getString("username"),
                rs.getString("password_hash"),
                rs.getString("role")
            ),
            username
        );

        if (users.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Invalid username or password."));
        }

        UserRecord user = users.get(0);

        if (!passwordEncoder.matches(password, user.passwordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Invalid username or password."));
        }

        if (!"ADMIN".equalsIgnoreCase(user.role())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Administrator access required."));
        }

        HttpSession session = request.getSession(true);
        request.changeSessionId();

        var authentication =
            new UsernamePasswordAuthenticationToken(
                user.username(),
                null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))
            );

        SecurityContext context =
            SecurityContextHolder.createEmptyContext();

        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);

        securityContextRepository.saveContext(context, request, response);

        return ResponseEntity.ok(Map.of(
            "message", "Login successful.",
            "username", user.username(),
            "role", user.role()
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<?> currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Not logged in."));
        }

        return ResponseEntity.ok(Map.of(
            "username", authentication.getName(),
            "role", "ADMIN"
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);

        if (session != null) {
            session.invalidate();
        }

        SecurityContextHolder.clearContext();

        return ResponseEntity.ok(
            Map.of("message", "Logged out successfully.")
        );
    }

    public record AuthRequest(String username, String password) {}

    private record UserRecord(
        String username,
        String passwordHash,
        String role
    ) {}
}
