
package com.bananamarket;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/buyer-slip")
@CrossOrigin(origins = "http://localhost:5173")
public class BuyerSlipController {

    private final JdbcTemplate jdbcTemplate;

    public BuyerSlipController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Get only buyers who purchased on the selected market date
    @GetMapping("/buyers")
    public List<Map<String, Object>> getBuyers(
            @RequestParam String marketDate) {

        validateDate(marketDate);

        return jdbcTemplate.queryForList(
            "SELECT DISTINCT " +
            "b.buyer_id, b.buyer_name " +
            "FROM auction_data a " +
            "JOIN buyer_data b ON b.buyer_id = a.buyer_id " +
            "WHERE a.auction_date = ? " +
            "ORDER BY b.buyer_name COLLATE NOCASE",
            marketDate
        );
    }

    // Get one buyer's rate-wise purchase details and calculations
    @GetMapping("/summary")
    public Map<String, Object> getBuyerSlip(
            @RequestParam Integer buyerId,
            @RequestParam String marketDate) {

        validateDate(marketDate);

        if (buyerId == null || buyerId <= 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Please select a valid buyer"
            );
        }

        List<Map<String, Object>> buyers = jdbcTemplate.queryForList(
            "SELECT buyer_id, buyer_name " +
            "FROM buyer_data WHERE buyer_id = ?",
            buyerId
        );

        if (buyers.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Buyer not found"
            );
        }

        // Separate lines for each farmer, delivery lot and price
        List<Map<String, Object>> purchases =
            jdbcTemplate.queryForList(
                "SELECT " +
                "a.seller_id, " +
                "s.seller_name, " +
                "a.stock_id, " +
                "st.lot_id, " +
                "st.delivery_date, " +
                "a.price, " +
                "SUM(a.quantity) AS quantity, " +
                "SUM(a.basic_amount) AS basic_amount, " +
                "SUM(a.buyer_charge) AS buyer_charge, " +
                "SUM(a.grand_total) AS grand_total " +

                "FROM auction_data a " +

                "JOIN seller_data s " +
                "ON s.seller_id = a.seller_id " +

                "JOIN stock_management st " +
                "ON st.stock_id = a.stock_id " +
                "AND st.seller_id = a.seller_id " +

                "WHERE a.auction_date = ? " +
                "AND a.buyer_id = ? " +

                "GROUP BY " +
                "a.seller_id, s.seller_name, " +
                "a.stock_id, st.lot_id, " +
                "st.delivery_date, a.price " +

                "ORDER BY " +
                "s.seller_name COLLATE NOCASE, " +
                "st.delivery_date, st.lot_id, a.price DESC",

                marketDate,
                buyerId
            );

        if (purchases.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "No purchases found for this buyer on the selected date"
            );
        }

        // Calculate buyer totals from the original auction records
        Map<String, Object> totals = jdbcTemplate.queryForMap(
            "SELECT " +
            "COALESCE(SUM(quantity), 0) AS total_quantity, " +
            "COALESCE(SUM(basic_amount), 0) AS basic_amount, " +
            "COALESCE(SUM(buyer_charge), 0) AS buyer_charge, " +
            "COALESCE(SUM(grand_total), 0) AS grand_total " +
            "FROM auction_data " +
            "WHERE auction_date = ? AND buyer_id = ?",
            marketDate,
            buyerId
        );

        Map<String, Object> response = new LinkedHashMap<>();

        response.put("buyer_id", buyerId);
        response.put("buyer_name", buyers.get(0).get("buyer_name"));
        response.put("market_date", marketDate);

        response.put("total_quantity", totals.get("total_quantity"));
        response.put("basic_amount", totals.get("basic_amount"));
        response.put("buyer_charge", totals.get("buyer_charge"));
        response.put("grand_total", totals.get("grand_total"));

        response.put("purchases", purchases);

        return response;
    }

    private void validateDate(String date) {
        try {
            LocalDate.parse(date);
        } catch (Exception ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Invalid market date"
            );
        }
    }
}
