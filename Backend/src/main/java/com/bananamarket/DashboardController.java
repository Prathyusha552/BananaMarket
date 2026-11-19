
package com.bananamarket;

import java.time.LocalDate;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@CrossOrigin(origins = "http://localhost:5173")
public class DashboardController {

    private final JdbcTemplate jdbcTemplate;

    public DashboardController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public Map<String, Object> getDashboardData() {

        String today = LocalDate.now().toString();

        Integer totalFarmers = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM seller_data",
            Integer.class
        );

        Integer totalBuyers = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM buyer_data",
            Integer.class
        );

        Integer registeredToday = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(registered_qty), 0) " +
            "FROM pre_auction WHERE market_date = ?",
            Integer.class,
            today
        );

        Integer soldToday = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(quantity), 0) " +
            "FROM auction_data WHERE auction_date = ?",
            Integer.class,
            today
        );

        Double auctionValueToday = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(quantity * price), 0) " +
            "FROM auction_data WHERE auction_date = ?",
            Double.class,
            today
        );

        Integer registeredUnsold = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(p.registered_qty), 0) " +
            "FROM pre_auction p " +
            "WHERE p.market_date <= ? " +
            "AND NOT EXISTS (" +
            "SELECT 1 FROM pre_auction newer " +
            "WHERE newer.stock_id = p.stock_id " +
            "AND newer.market_date > p.market_date " +
            "AND newer.market_date <= ?" +
            ")",
            Integer.class,
            today,
            today
        );

        return Map.of(
            "date", today,
            "total_farmers", totalFarmers,
            "total_buyers", totalBuyers,
            "registered_today", registeredToday,
            "sold_today", soldToday,
            "auction_value_today", auctionValueToday,
            "registered_unsold", registeredUnsold
        );
    }
}
