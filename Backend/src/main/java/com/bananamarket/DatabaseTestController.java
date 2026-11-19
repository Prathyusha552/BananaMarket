
package com.bananamarket;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;

@RestController
@CrossOrigin(origins = "http://localhost:5173")
public class DatabaseTestController {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseTestController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Test database tables
    @GetMapping("/api/database-test")
    public List<String> testDatabase() {

        return jdbcTemplate.queryForList(
            "SELECT name FROM sqlite_master " +
            "WHERE type = 'table' " +
            "AND name NOT LIKE 'sqlite_%' " +
            "ORDER BY name",
            String.class
        );
    }

    // Get all buyers
    @GetMapping("/api/buyers")
    public List<Map<String, Object>> getBuyers() {

        return jdbcTemplate.queryForList(
            "SELECT buyer_id, buyer_name, buyer_mobile, village, created_at " +
            "FROM buyer_data ORDER BY buyer_name"
        );
    }

    // Check users table structure
    @GetMapping("/api/users-structure")
    public List<Map<String, Object>> getUsersStructure() {

        return jdbcTemplate.queryForList(
            "PRAGMA table_info(users)"
        );
    }

    // Check existing administrator usernames and roles
    // Password hashes are never displayed
    @GetMapping("/api/admin-status")
    public List<Map<String, Object>> getAdminStatus() {

        return jdbcTemplate.queryForList(
            "SELECT username, role FROM users ORDER BY user_id"
        );
    }
}
