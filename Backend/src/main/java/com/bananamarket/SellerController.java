
package com.bananamarket;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sellers")
@CrossOrigin(origins = "*")
public class SellerController {

    private final JdbcTemplate jdbcTemplate;

    public SellerController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Get all sellers
    @GetMapping
    public List<Map<String, Object>> getSellers() {
        return jdbcTemplate.queryForList(
            "SELECT seller_id, seller_name, seller_mobile, village, created_at " +
            "FROM seller_data ORDER BY seller_name"
        );
    }

    // Add a new seller
    @PostMapping
    public String addSeller(@RequestBody Map<String, String> seller) {

        String name = seller.get("seller_name");

        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("Seller name is required");
        }

        jdbcTemplate.update(
            "INSERT INTO seller_data (seller_name, seller_mobile, village) VALUES (?, ?, ?)",
            name.trim(),
            seller.get("seller_mobile"),
            seller.get("village")
        );

        return "Seller added successfully";
    }
}
