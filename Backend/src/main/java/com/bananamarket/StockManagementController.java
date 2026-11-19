
package com.bananamarket;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/stock-management")
@CrossOrigin(origins = "http://localhost:5173")
public class StockManagementController {

    private final JdbcTemplate jdbcTemplate;

    public StockManagementController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        ensureTravelAllowanceColumn();
    }

    // Add travel allowance column if it does not already exist.
    private void ensureTravelAllowanceColumn() {

        List<Map<String, Object>> columns =
            jdbcTemplate.queryForList(
                "PRAGMA table_info(stock_management)"
            );

        boolean exists = columns.stream().anyMatch(column ->
            "travel_allowance".equalsIgnoreCase(
                String.valueOf(column.get("name"))
            )
        );

        if (!exists) {
            jdbcTemplate.execute(
                "ALTER TABLE stock_management " +
                "ADD COLUMN travel_allowance REAL NOT NULL DEFAULT 0"
            );
        }
    }

    // Display stock balances for the selected market date
    @GetMapping
    public List<Map<String, Object>> getStockManagement(
            @RequestParam String marketDate) {

        validateDate(marketDate);

        return jdbcTemplate.queryForList(
            "SELECT " +
            "st.stock_id, st.seller_id, s.seller_name, " +
            "st.lot_id, st.delivery_date, st.original_qty, " +
            "st.travel_allowance, " +

            "(SELECT COALESCE(SUM(p.registered_qty), 0) " +
            " FROM pre_auction p " +
            " WHERE p.stock_id = st.stock_id " +
            " AND p.market_date <= ?) AS registered_qty, " +

            "(SELECT COALESCE(SUM(p.registered_qty), 0) " +
            " FROM pre_auction p " +
            " WHERE p.stock_id = st.stock_id " +
            " AND p.market_date = ?) AS registered_today, " +

            "(SELECT COALESCE(SUM(a.quantity), 0) " +
            " FROM auction_data a " +
            " WHERE a.stock_id = st.stock_id " +
            " AND a.auction_date <= ?) AS sold_qty, " +

            "(SELECT COALESCE(SUM(a.quantity), 0) " +
            " FROM auction_data a " +
            " WHERE a.stock_id = st.stock_id " +
            " AND a.auction_date = ?) AS sold_today, " +

            "(st.original_qty - " +
            "(SELECT COALESCE(SUM(p.registered_qty), 0) " +
            " FROM pre_auction p " +
            " WHERE p.stock_id = st.stock_id " +
            " AND p.market_date <= ?)) AS unregistered_qty, " +

            "((SELECT COALESCE(SUM(p.registered_qty), 0) " +
            " FROM pre_auction p " +
            " WHERE p.stock_id = st.stock_id " +
            " AND p.market_date <= ?) - " +

            "(SELECT COALESCE(SUM(a.quantity), 0) " +
            " FROM auction_data a " +
            " WHERE a.stock_id = st.stock_id " +
            " AND a.auction_date <= ?)) AS registered_unsold_qty, " +

            "(st.original_qty - " +
            "(SELECT COALESCE(SUM(a.quantity), 0) " +
            " FROM auction_data a " +
            " WHERE a.stock_id = st.stock_id " +
            " AND a.auction_date <= ?)) AS total_remaining_qty " +

            "FROM stock_management st " +
            "JOIN seller_data s ON st.seller_id = s.seller_id " +
            "WHERE st.delivery_date <= ? " +
            "ORDER BY st.delivery_date DESC, s.seller_name",

            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate
        );
    }

    // Create delivery lot ONLY.
    // Do not automatically register quantity in Pre-Auction.
    @PostMapping
    @Transactional
    public Map<String, Object> createStock(
            @RequestBody Map<String, Object> data) {

        String sellerName = requiredText(data, "seller_name");
        String deliveryDate = requiredText(data, "delivery_date");
        int originalQty = requiredInt(data, "original_qty");

        double travelAllowance =
            optionalTravelAllowance(data, 0.0);

        validateDate(deliveryDate);

        if (originalQty <= 0) {
            throw badRequest(
                "Original quantity must be greater than zero"
            );
        }

        int sellerId = getOrCreateSeller(sellerName);

        String lotId = "LOT-" + deliveryDate + "-" +
            UUID.randomUUID().toString().substring(0, 8);

        jdbcTemplate.update(
            "INSERT INTO stock_management " +
            "(seller_id, lot_id, delivery_date, original_qty, travel_allowance) " +
            "VALUES (?, ?, ?, ?, ?)",
            sellerId, lotId, deliveryDate,
            originalQty, travelAllowance
        );

        Integer stockId = jdbcTemplate.queryForObject(
            "SELECT stock_id FROM stock_management WHERE lot_id = ?",
            Integer.class,
            lotId
        );

        if (stockId == null) {
            throw new ResponseStatusException(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Stock lot could not be created"
            );
        }

        // HashMap supports more than 10 key-value pairs.
        Map<String, Object> response = new HashMap<>();

        response.put(
            "message",
            "Delivery stock created successfully. Register it separately in Pre-Auction."
        );
        response.put("stock_id", stockId);
        response.put("seller_id", sellerId);
        response.put("lot_id", lotId);
        response.put("original_qty", originalQty);
        response.put("travel_allowance", travelAllowance);
        response.put("registered_qty", 0);
        response.put("sold_qty", 0);
        response.put("registered_unsold_qty", 0);
        response.put("unregistered_qty", originalQty);
        response.put("total_remaining_qty", originalQty);

        return response;
    }

    // Edit an existing delivery lot
    @PutMapping("/{stockId}")
    @Transactional
    public Map<String, Object> updateStock(
            @PathVariable int stockId,
            @RequestBody Map<String, Object> data) {

        Map<String, Object> existing = findStock(stockId);

        String sellerName = requiredText(data, "seller_name");
        String deliveryDate = requiredText(data, "delivery_date");
        int originalQty = requiredInt(data, "original_qty");

        double oldTravelAllowance =
            existing.get("travel_allowance") == null
                ? 0.0
                : ((Number) existing.get("travel_allowance")).doubleValue();

        double travelAllowance =
            optionalTravelAllowance(data, oldTravelAllowance);

        validateDate(deliveryDate);

        if (originalQty <= 0) {
            throw badRequest(
                "Original quantity must be greater than zero"
            );
        }

        Integer registered = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(registered_qty), 0) " +
            "FROM pre_auction WHERE stock_id = ?",
            Integer.class, stockId
        );

        Integer sold = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(quantity), 0) " +
            "FROM auction_data WHERE stock_id = ?",
            Integer.class, stockId
        );

        int registeredTotal = registered == null ? 0 : registered;
        int soldTotal = sold == null ? 0 : sold;

        if (originalQty < registeredTotal) {
            throw badRequest(
                "Original quantity cannot be less than total registered quantity"
            );
        }

        if (originalQty < soldTotal) {
            throw badRequest(
                "Original quantity cannot be less than total sold quantity"
            );
        }

        if (registeredTotal > 0 &&
                deliveryDate.compareTo(
                    existing.get("delivery_date").toString()
                ) != 0) {
            throw badRequest(
                "Delivery date cannot be changed after registration"
            );
        }

        int oldSellerId =
            ((Number) existing.get("seller_id")).intValue();

        int newSellerId = getOrCreateSeller(sellerName);

        if (oldSellerId != newSellerId && registeredTotal > 0) {
            throw badRequest(
                "Farmer cannot be changed after stock has been registered"
            );
        }

        jdbcTemplate.update(
            "UPDATE stock_management " +
            "SET seller_id = ?, delivery_date = ?, original_qty = ?, " +
            "travel_allowance = ? " +
            "WHERE stock_id = ?",
            newSellerId, deliveryDate, originalQty,
            travelAllowance, stockId
        );

        Map<String, Object> response = new HashMap<>();
        response.put("message", "Stock lot updated successfully");
        response.put("stock_id", stockId);
        response.put("original_qty", originalQty);
        response.put("travel_allowance", travelAllowance);

        return response;
    }

    // Register additional quantity from an existing delivery lot
    @PostMapping("/{stockId}/register")
    @Transactional
    public Map<String, Object> registerExistingStock(
            @PathVariable int stockId,
            @RequestBody Map<String, Object> data) {

        Map<String, Object> stock = findStock(stockId);

        String marketDate = requiredText(data, "market_date");
        int quantity = requiredInt(data, "registered_qty");

        validateDate(marketDate);

        String deliveryDate =
            stock.get("delivery_date").toString();

        if (marketDate.compareTo(deliveryDate) < 0) {
            throw badRequest(
                "Market date cannot be before delivery date"
            );
        }

        if (quantity <= 0) {
            throw badRequest(
                "Registered quantity must be greater than zero"
            );
        }

        int originalQty =
            ((Number) stock.get("original_qty")).intValue();

        Integer total = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(registered_qty), 0) " +
            "FROM pre_auction WHERE stock_id = ?",
            Integer.class, stockId
        );

        int alreadyRegistered = total == null ? 0 : total;
        int unregistered = originalQty - alreadyRegistered;

        if (quantity > unregistered) {
            throw badRequest(
                "Only " + unregistered +
                " unregistered bunches are available"
            );
        }

        int sellerId =
            ((Number) stock.get("seller_id")).intValue();

        Integer existingRegistration = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM pre_auction " +
            "WHERE stock_id = ? AND market_date = ?",
            Integer.class, stockId, marketDate
        );

        if (existingRegistration != null &&
                existingRegistration > 0) {

            jdbcTemplate.update(
                "UPDATE pre_auction " +
                "SET registered_qty = registered_qty + ? " +
                "WHERE stock_id = ? AND market_date = ?",
                quantity, stockId, marketDate
            );

        } else {

            jdbcTemplate.update(
                "INSERT INTO pre_auction " +
                "(market_date, stock_id, seller_id, registered_qty) " +
                "VALUES (?, ?, ?, ?)",
                marketDate, stockId, sellerId, quantity
            );
        }

        int newTotalRegistered =
            alreadyRegistered + quantity;

        Integer soldTodayOrEarlier = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(quantity), 0) " +
            "FROM auction_data " +
            "WHERE stock_id = ? AND auction_date <= ?",
            Integer.class, stockId, marketDate
        );

        int sold = soldTodayOrEarlier == null
            ? 0 : soldTodayOrEarlier;

        return Map.of(
            "message", "Quantity registered successfully",
            "stock_id", stockId,
            "registered_today", quantity,
            "total_registered", newTotalRegistered,
            "sold_until_date", sold,
            "registered_unsold", newTotalRegistered - sold,
            "unregistered_remaining",
                originalQty - newTotalRegistered
        );
    }

    // Delete a stock lot only if it has no registrations or sales
    @DeleteMapping("/{stockId}")
    @Transactional
    public Map<String, Object> deleteStock(
            @PathVariable int stockId) {

        Map<String, Object> existing = findStock(stockId);

        Integer registrationCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM pre_auction WHERE stock_id = ?",
            Integer.class, stockId
        );

        Integer soldCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM auction_data WHERE stock_id = ?",
            Integer.class, stockId
        );

        if ((registrationCount != null && registrationCount > 0) ||
                (soldCount != null && soldCount > 0)) {
            throw badRequest(
                "This lot has registration or auction records and cannot be deleted"
            );
        }

        jdbcTemplate.update(
            "DELETE FROM stock_management WHERE stock_id = ?",
            stockId
        );

        return Map.of(
            "message", "Stock lot deleted successfully",
            "lot_id", existing.get("lot_id")
        );
    }

    // Find stock lot
    private Map<String, Object> findStock(int stockId) {

        List<Map<String, Object>> rows =
            jdbcTemplate.queryForList(
                "SELECT * FROM stock_management WHERE stock_id = ?",
                stockId
            );

        if (rows.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Stock lot not found"
            );
        }

        return rows.get(0);
    }

    // Create or find farmer
    private int getOrCreateSeller(String sellerName) {

        jdbcTemplate.update(
            "INSERT OR IGNORE INTO seller_data (seller_name) VALUES (?)",
            sellerName
        );

        Integer sellerId = jdbcTemplate.queryForObject(
            "SELECT seller_id FROM seller_data " +
            "WHERE seller_name = ? COLLATE NOCASE",
            Integer.class, sellerName
        );

        if (sellerId == null) {
            throw badRequest("Farmer could not be saved");
        }

        return sellerId;
    }

    private String requiredText(
            Map<String, Object> data, String key) {

        Object value = data.get(key);

        if (value == null ||
                value.toString().trim().isEmpty()) {
            throw badRequest(key + " is required");
        }

        return value.toString().trim();
    }

    private int requiredInt(
            Map<String, Object> data, String key) {

        try {
            return Integer.parseInt(
                requiredText(data, key)
            );
        } catch (NumberFormatException ex) {
            throw badRequest(
                key + " must be a whole number"
            );
        }
    }

    // Read and validate travel allowance.
    private double optionalTravelAllowance(
            Map<String, Object> data, double defaultValue) {

        Object value = data.get("travel_allowance");

        if (value == null ||
                value.toString().trim().isEmpty()) {
            return defaultValue;
        }

        try {
            BigDecimal amount =
                new BigDecimal(value.toString().trim());

            if (amount.compareTo(BigDecimal.ZERO) < 0) {
                throw badRequest(
                    "Travel allowance cannot be negative"
                );
            }

            return amount.doubleValue();

        } catch (NumberFormatException ex) {
            throw badRequest(
                "Travel allowance must be a valid amount"
            );
        }
    }

    private void validateDate(String date) {

        try {
            LocalDate.parse(date);
        } catch (Exception ex) {
            throw badRequest("Invalid date: " + date);
        }
    }

    private ResponseStatusException badRequest(
            String message) {

        return new ResponseStatusException(
            HttpStatus.BAD_REQUEST, message
        );
    }
}
