
package com.bananamarket;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/seller-slip")
@CrossOrigin(origins = "http://localhost:5173")
public class SellerSlipController {

    private final JdbcTemplate jdbcTemplate;

    public SellerSlipController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        ensureRequiredColumns();
    }

    // Add required columns only when they do not already exist.
    private void ensureRequiredColumns() {

        List<Map<String, Object>> columns =
            jdbcTemplate.queryForList(
                "PRAGMA table_info(stock_management)"
            );

        boolean completionExists = columns.stream().anyMatch(column ->
            "seller_slip_completed".equalsIgnoreCase(
                String.valueOf(column.get("name"))
            )
        );

        boolean travelAllowanceExists = columns.stream().anyMatch(column ->
            "travel_allowance".equalsIgnoreCase(
                String.valueOf(column.get("name"))
            )
        );

        if (!completionExists) {
            jdbcTemplate.execute(
                "ALTER TABLE stock_management " +
                "ADD COLUMN seller_slip_completed INTEGER NOT NULL DEFAULT 0"
            );
        }

        if (!travelAllowanceExists) {
            jdbcTemplate.execute(
                "ALTER TABLE stock_management " +
                "ADD COLUMN travel_allowance REAL NOT NULL DEFAULT 0"
            );
        }
    }

    // GET SELLERS
    @GetMapping("/sellers")
    public List<Map<String, Object>> getSellers() {

        return jdbcTemplate.queryForList(
            "SELECT seller_id, seller_name " +
            "FROM seller_data " +
            "ORDER BY seller_name"
        );
    }

    // GET DELIVERY-WISE SELLER SLIPS
    @GetMapping("/deliveries")
    public List<Map<String, Object>> getDeliveries(
        @RequestParam int sellerId
    ) {

        List<Map<String, Object>> rows =
            jdbcTemplate.queryForList(
                "SELECT " +
                "sm.stock_id, " +
                "sm.lot_id, " +
                "sm.delivery_date, " +
                "COALESCE(SUM(ad.quantity), 0) AS sold_qty, " +
                "COALESCE(SUM(ad.quantity * ad.price), 0) AS gross_amount, " +
                "COALESCE(sm.travel_allowance, 0) AS travel_allowance, " +
                "COALESCE(sm.seller_slip_completed, 0) AS completed " +
                "FROM stock_management sm " +
                "JOIN auction_data ad " +
                "ON ad.stock_id = sm.stock_id " +
                "AND ad.seller_id = sm.seller_id " +
                "WHERE sm.seller_id = ? " +
                "GROUP BY " +
                "sm.stock_id, " +
                "sm.lot_id, " +
                "sm.delivery_date, " +
                "sm.travel_allowance, " +
                "sm.seller_slip_completed " +
                "HAVING SUM(ad.quantity) > 0 " +
                "ORDER BY sm.delivery_date DESC, sm.stock_id ASC",
                sellerId
            );

        Map<String, Integer> dateCounts = new HashMap<>();

        for (Map<String, Object> row : rows) {

            String date = String.valueOf(row.get("delivery_date"));

            dateCounts.put(
                date,
                dateCounts.getOrDefault(date, 0) + 1
            );
        }

        Map<String, Integer> dateIndexes = new HashMap<>();

        List<Map<String, Object>> result = new ArrayList<>();

        for (Map<String, Object> original : rows) {

            Map<String, Object> row =
                new LinkedHashMap<>(original);

            String date = String.valueOf(row.get("delivery_date"));

            int count = dateCounts.getOrDefault(date, 1);

            int index = dateIndexes.getOrDefault(date, 0);

            dateIndexes.put(date, index + 1);

            String label = date;

            if (count > 1) {
                label = date + " - " + (char) ('A' + index);
            }

            row.put("delivery_label", label);

            row.put(
                "completed",
                ((Number) row.get("completed")).intValue() == 1
            );

            row.put(
                "travel_allowance",
                new BigDecimal(
                    String.valueOf(row.get("travel_allowance"))
                ).setScale(2, RoundingMode.HALF_UP)
            );

            result.add(row);
        }

        return result;
    }

    // GET ONE DELIVERY'S INDIVIDUAL BUNCH PRICES AND SETTLEMENT
    @GetMapping("/summary")
    public Map<String, Object> getDeliverySummary(
        @RequestParam int stockId
    ) {

        Map<String, Object> delivery;

        try {

            delivery = jdbcTemplate.queryForMap(
                "SELECT " +
                "sm.stock_id, " +
                "sm.lot_id, " +
                "sm.delivery_date, " +
                "COALESCE(sm.seller_slip_completed, 0) AS completed, " +
                "COALESCE(sm.travel_allowance, 0) AS travel_allowance, " +
                "sd.seller_id, " +
                "sd.seller_name " +
                "FROM stock_management sm " +
                "JOIN seller_data sd " +
                "ON sd.seller_id = sm.seller_id " +
                "WHERE sm.stock_id = ?",
                stockId
            );

        } catch (
            org.springframework.dao.EmptyResultDataAccessException ex
        ) {

            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Delivery not found"
            );
        }

        List<Map<String, Object>> transactions =
            jdbcTemplate.queryForList(
                "SELECT auction_date, quantity, price " +
                "FROM auction_data " +
                "WHERE stock_id = ? AND seller_id = ? " +
                "ORDER BY auction_date, auction_id",
                stockId,
                delivery.get("seller_id")
            );

        List<Map<String, Object>> bunchPrices =
            new ArrayList<>();

        int totalQuantity = 0;

        BigDecimal grossAmount = BigDecimal.ZERO;

        int bunchNumber = 0;

        for (Map<String, Object> transaction : transactions) {

            int quantity =
                ((Number) transaction.get("quantity")).intValue();

            BigDecimal price = new BigDecimal(
                String.valueOf(transaction.get("price"))
            );

            for (int i = 0; i < quantity; i++) {

                bunchNumber++;

                Map<String, Object> bunch =
                    new LinkedHashMap<>();

                bunch.put("bunch_number", bunchNumber);
                bunch.put("auction_date", transaction.get("auction_date"));
                bunch.put("price", price);

                bunchPrices.add(bunch);
            }

            totalQuantity += quantity;

            grossAmount = grossAmount.add(
                price.multiply(
                    BigDecimal.valueOf(quantity)
                )
            );
        }

        // 12% seller commission
        BigDecimal commission = grossAmount
            .multiply(new BigDecimal("0.12"))
            .setScale(2, RoundingMode.HALF_UP);

        // ₹3 deduction per sold bunch
        BigDecimal deduction3 =
            BigDecimal.valueOf(totalQuantity)
                .multiply(BigDecimal.valueOf(3));

        // ₹4 deduction per sold bunch
        BigDecimal deduction4 =
            BigDecimal.valueOf(totalQuantity)
                .multiply(BigDecimal.valueOf(4));

        // Read travel allowance belonging to THIS delivery.
        BigDecimal travelAllowance = new BigDecimal(
            String.valueOf(delivery.get("travel_allowance"))
        ).setScale(2, RoundingMode.HALF_UP);

        // Total deductions include travel allowance.
        BigDecimal totalDeductions = commission
            .add(deduction3)
            .add(deduction4)
            .add(travelAllowance)
            .setScale(2, RoundingMode.HALF_UP);

        // Final farmer settlement.
        BigDecimal netAmount = grossAmount
            .subtract(totalDeductions)
            .setScale(2, RoundingMode.HALF_UP);

        Map<String, Object> result =
            new LinkedHashMap<>();

        result.putAll(delivery);

        result.put(
            "completed",
            ((Number) delivery.get("completed")).intValue() == 1
        );

        result.put("total_quantity", totalQuantity);

        result.put(
            "gross_amount",
            grossAmount.setScale(2, RoundingMode.HALF_UP)
        );

        result.put("commission", commission);

        result.put("deduction_3", deduction3);

        result.put("deduction_4", deduction4);

        result.put("travel_allowance", travelAllowance);

        result.put("total_deductions", totalDeductions);

        result.put("net_amount", netAmount);

        result.put("bunch_prices", bunchPrices);

        return result;
    }

    // COMPLETE EXACTLY ONE DELIVERY
    @PostMapping("/{stockId}/complete")
    public Map<String, Object> completeSlip(
        @PathVariable int stockId
    ) {

        int updated = jdbcTemplate.update(
            "UPDATE stock_management " +
            "SET seller_slip_completed = 1 " +
            "WHERE stock_id = ? " +
            "AND EXISTS (" +
            "SELECT 1 FROM auction_data " +
            "WHERE auction_data.stock_id = stock_management.stock_id" +
            ")",
            stockId
        );

        if (updated == 0) {

            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Delivery not found or has no sales"
            );
        }

        Map<String, Object> result =
            new LinkedHashMap<>();

        result.put("stock_id", stockId);
        result.put("completed", true);

        result.put(
            "message",
            "Seller slip completed successfully"
        );

        return result;
    }
}
