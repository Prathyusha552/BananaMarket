
package com.bananamarket;

import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/buyers")
@CrossOrigin(origins = "*")
public class BuyerController {

    private final JdbcTemplate jdbcTemplate;

    public BuyerController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Add a new buyer
    @PostMapping
    public String addBuyer(@RequestBody Map<String, String> buyer) {

        String name = buyer.get("buyer_name");

        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("Buyer name is required");
        }

        jdbcTemplate.update(
            "INSERT INTO buyer_data (buyer_name, buyer_mobile, village) VALUES (?, ?, ?)",
            name.trim(),
            buyer.get("buyer_mobile"),
            buyer.get("village")
        );

        return "Buyer added successfully";
    }
}
