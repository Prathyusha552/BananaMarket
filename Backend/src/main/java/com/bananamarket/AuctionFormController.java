
package com.bananamarket;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auction-form")
@CrossOrigin(origins = "http://localhost:5173")
public class AuctionFormController {

    private final JdbcTemplate jdbcTemplate;

    public AuctionFormController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Get one row per delivery lot with cumulative available stock
    @GetMapping("/sellers")
    public List<Map<String, Object>> getRegisteredSellers(
            @RequestParam String marketDate) {

        validateDate(marketDate);

        return jdbcTemplate.queryForList(
            "SELECT " +
            "st.seller_id, " +
            "s.seller_name, " +
            "st.stock_id, " +
            "st.lot_id, " +
            "st.delivery_date, " +
            "st.original_qty, " +

            "COALESCE((" +
            "SELECT SUM(p.registered_qty) " +
            "FROM pre_auction p " +
            "WHERE p.stock_id = st.stock_id " +
            "AND p.seller_id = st.seller_id " +
            "AND p.market_date <= ?" +
            "), 0) AS registered_qty, " +

            "COALESCE((" +
            "SELECT SUM(a.quantity) " +
            "FROM auction_data a " +
            "WHERE a.stock_id = st.stock_id " +
            "AND a.seller_id = st.seller_id " +
            "AND a.auction_date <= ?" +
            "), 0) AS sold_qty, " +

            "(" +
            "COALESCE((" +
            "SELECT SUM(p.registered_qty) " +
            "FROM pre_auction p " +
            "WHERE p.stock_id = st.stock_id " +
            "AND p.seller_id = st.seller_id " +
            "AND p.market_date <= ?" +
            "), 0) - " +

            "COALESCE((" +
            "SELECT SUM(a.quantity) " +
            "FROM auction_data a " +
            "WHERE a.stock_id = st.stock_id " +
            "AND a.seller_id = st.seller_id " +
            "AND a.auction_date <= ?" +
            "), 0)" +
            ") AS available_qty " +

            "FROM stock_management st " +
            "JOIN seller_data s ON s.seller_id = st.seller_id " +

            "WHERE EXISTS (" +
            "SELECT 1 FROM pre_auction p " +
            "WHERE p.stock_id = st.stock_id " +
            "AND p.seller_id = st.seller_id " +
            "AND p.market_date <= ?" +
            ") " +

            "AND (" +
            "COALESCE((" +
            "SELECT SUM(p.registered_qty) " +
            "FROM pre_auction p " +
            "WHERE p.stock_id = st.stock_id " +
            "AND p.seller_id = st.seller_id " +
            "AND p.market_date <= ?" +
            "), 0) - " +

            "COALESCE((" +
            "SELECT SUM(a.quantity) " +
            "FROM auction_data a " +
            "WHERE a.stock_id = st.stock_id " +
            "AND a.seller_id = st.seller_id " +
            "AND a.auction_date <= ?" +
            "), 0)" +
            ") > 0 " +

            "ORDER BY s.seller_name, st.delivery_date, st.stock_id",

            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate,
            marketDate
        );
    }

    // Get saved auction entries for a date and optionally a delivery lot
    @GetMapping("/entries")
    public List<Map<String, Object>> getAuctionEntries(
            @RequestParam String marketDate,
            @RequestParam(required = false) Integer stockId) {

        validateDate(marketDate);

        return jdbcTemplate.queryForList(
            "SELECT a.auction_id, a.auction_date, " +
            "a.seller_id, s.seller_name, a.buyer_id, b.buyer_name, " +
            "a.stock_id, st.delivery_date, st.lot_id, " +
            "a.quantity, a.price, " +
            "a.basic_amount, a.buyer_charge, a.grand_total, " +
            "a.seller_commission, a.seller_deduction_3, " +
            "a.seller_deduction_4, " +
            "(a.basic_amount - a.seller_commission - " +
            "a.seller_deduction_3 - a.seller_deduction_4) AS seller_net " +
            "FROM auction_data a " +
            "JOIN seller_data s ON a.seller_id = s.seller_id " +
            "JOIN buyer_data b ON a.buyer_id = b.buyer_id " +
            "JOIN stock_management st ON a.stock_id = st.stock_id " +
            "WHERE a.auction_date = ? " +
            "AND (? IS NULL OR a.stock_id = ?) " +
            "ORDER BY a.auction_id DESC",
            marketDate, stockId, stockId
        );
    }

    // Save one auction entry
    @PostMapping("/entries")
    @Transactional
    public Map<String, Object> saveAuctionEntry(
            @RequestBody Map<String, Object> data) {

        String marketDate = requiredText(data, "market_date");
        int sellerId = requiredInt(data, "seller_id");
        int stockId = requiredInt(data, "stock_id");
        String buyerName = requiredText(data, "buyer_name");
        int quantity = requiredInt(data, "quantity");
        double price = requiredDouble(data, "price");

        validateDate(marketDate);
        validateQuantityAndPrice(quantity, price);

        validateRegisteredLot(marketDate, sellerId, stockId);
        checkAvailableStock(marketDate, sellerId, stockId, quantity, null);

        int buyerId = getOrCreateBuyer(buyerName);
        int auctionFormId = getOrCreateAuctionForm(marketDate);

        jdbcTemplate.update(
            "INSERT INTO auction_data " +
            "(auction_form_id, auction_date, seller_id, buyer_id, " +
            "stock_id, quantity, price) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            auctionFormId, marketDate, sellerId, buyerId,
            stockId, quantity, price
        );

        Integer auctionId = jdbcTemplate.queryForObject(
            "SELECT last_insert_rowid()",
            Integer.class
        );

        return getEntry(auctionId);
    }

    // Edit buyer, quantity and price of an existing entry
    @PutMapping("/entries/{auctionId}")
    @Transactional
    public Map<String, Object> updateAuctionEntry(
            @PathVariable int auctionId,
            @RequestBody Map<String, Object> data) {

        Map<String, Object> existing = findExistingEntry(auctionId);

        String buyerName = requiredText(data, "buyer_name");
        int quantity = requiredInt(data, "quantity");
        double price = requiredDouble(data, "price");

        validateQuantityAndPrice(quantity, price);

        int stockId = ((Number) existing.get("stock_id")).intValue();
        int sellerId = ((Number) existing.get("seller_id")).intValue();
        String marketDate = existing.get("auction_date").toString();

        checkAvailableStock(
            marketDate, sellerId, stockId, quantity, auctionId
        );

        int buyerId = getOrCreateBuyer(buyerName);

        jdbcTemplate.update(
            "UPDATE auction_data " +
            "SET buyer_id = ?, quantity = ?, price = ? " +
            "WHERE auction_id = ?",
            buyerId, quantity, price, auctionId
        );

        return getEntry(auctionId);
    }

    // Delete an auction entry
    @DeleteMapping("/entries/{auctionId}")
    @Transactional
    public Map<String, Object> deleteAuctionEntry(
            @PathVariable int auctionId) {

        Map<String, Object> existing = findExistingEntry(auctionId);

        jdbcTemplate.update(
            "DELETE FROM auction_data WHERE auction_id = ?",
            auctionId
        );

        return Map.of(
            "message", "Auction entry deleted successfully",
            "deleted_auction_id", auctionId,
            "stock_id", existing.get("stock_id")
        );
    }

    // Validate required text
    private String requiredText(Map<String, Object> data, String key) {

        Object value = data.get(key);

        if (value == null || value.toString().trim().isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, key + " is required"
            );
        }

        return value.toString().trim();
    }

    // Validate integer fields
    private int requiredInt(Map<String, Object> data, String key) {

        try {
            return Integer.parseInt(requiredText(data, key));
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                key + " must be a whole number"
            );
        }
    }

    // Validate decimal fields
    private double requiredDouble(Map<String, Object> data, String key) {

        try {
            double value = Double.parseDouble(requiredText(data, key));

            if (!Double.isFinite(value)) {
                throw new NumberFormatException();
            }

            return value;

        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                key + " must be a valid number"
            );
        }
    }

    // Validate market date
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

    // Validate quantity and price
    private void validateQuantityAndPrice(int quantity, double price) {

        if (quantity <= 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Quantity must be greater than zero"
            );
        }

        if (price < 0 || !Double.isFinite(price)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Price cannot be negative"
            );
        }
    }

    // Verify that this farmer owns the lot and registered it by this date
    private void validateRegisteredLot(
            String marketDate, int sellerId, int stockId) {

        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM pre_auction p " +
            "JOIN stock_management st ON st.stock_id = p.stock_id " +
            "WHERE p.market_date <= ? " +
            "AND p.seller_id = ? " +
            "AND p.stock_id = ? " +
            "AND st.seller_id = ?",
            Integer.class,
            marketDate, sellerId, stockId, sellerId
        );

        if (count == null || count == 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "This delivery lot is not registered for this farmer on or before the selected market date"
            );
        }
    }

    // Check cumulative registered unsold quantity for this specific lot
    private void checkAvailableStock(
            String marketDate,
            int sellerId,
            int stockId,
            int requestedQty,
            Integer excludedAuctionId) {

        Integer available = jdbcTemplate.queryForObject(
            "SELECT " +

            "COALESCE((" +
            "SELECT SUM(p.registered_qty) " +
            "FROM pre_auction p " +
            "WHERE p.stock_id = ? " +
            "AND p.seller_id = ? " +
            "AND p.market_date <= ?" +
            "), 0) - " +

            "COALESCE((" +
            "SELECT SUM(a.quantity) " +
            "FROM auction_data a " +
            "WHERE a.stock_id = ? " +
            "AND a.seller_id = ? " +
            "AND a.auction_date <= ? " +
            "AND (? IS NULL OR a.auction_id <> ?)" +
            "), 0) " +

            "FROM stock_management st " +
            "WHERE st.stock_id = ? " +
            "AND st.seller_id = ?",

            Integer.class,

            stockId, sellerId, marketDate,
            stockId, sellerId, marketDate,
            excludedAuctionId, excludedAuctionId,
            stockId, sellerId
        );

        if (available == null) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Delivery lot not found for this farmer"
            );
        }

        if (available < 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "This lot has more recorded sales than registered quantity. Please check its records."
            );
        }

        if (requestedQty > available) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Only " + available + " registered unsold bunches are available in this lot"
            );
        }
    }

    // Add buyer if new; otherwise use existing buyer
    private int getOrCreateBuyer(String buyerName) {

        jdbcTemplate.update(
            "INSERT OR IGNORE INTO buyer_data (buyer_name) VALUES (?)",
            buyerName
        );

        Integer buyerId = jdbcTemplate.queryForObject(
            "SELECT buyer_id FROM buyer_data " +
            "WHERE buyer_name = ? COLLATE NOCASE",
            Integer.class,
            buyerName
        );

        if (buyerId == null) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Buyer could not be saved"
            );
        }

        return buyerId;
    }

    // Get existing auction form or create one
    private int getOrCreateAuctionForm(String marketDate) {

        List<Integer> ids = jdbcTemplate.queryForList(
            "SELECT auction_form_id FROM auction_form " +
            "WHERE auction_date = ? " +
            "ORDER BY auction_form_id LIMIT 1",
            Integer.class,
            marketDate
        );

        if (!ids.isEmpty()) {
            return ids.get(0);
        }

        jdbcTemplate.update(
            "INSERT INTO auction_form (auction_date) VALUES (?)",
            marketDate
        );

        return jdbcTemplate.queryForObject(
            "SELECT last_insert_rowid()",
            Integer.class
        );
    }

    // Find existing auction entry
    private Map<String, Object> findExistingEntry(int auctionId) {

        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT * FROM auction_data WHERE auction_id = ?",
            auctionId
        );

        if (rows.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Auction entry not found"
            );
        }

        return rows.get(0);
    }

    // Return saved auction entry with calculations
    private Map<String, Object> getEntry(int auctionId) {

        return jdbcTemplate.queryForMap(
            "SELECT a.auction_id, a.auction_date, " +
            "a.seller_id, s.seller_name, a.buyer_id, b.buyer_name, " +
            "a.stock_id, st.delivery_date, st.lot_id, " +
            "a.quantity, a.price, " +
            "a.basic_amount, a.buyer_charge, a.grand_total, " +
            "a.seller_commission, a.seller_deduction_3, " +
            "a.seller_deduction_4, " +
            "(a.basic_amount - a.seller_commission - " +
            "a.seller_deduction_3 - a.seller_deduction_4) AS seller_net " +
            "FROM auction_data a " +
            "JOIN seller_data s ON a.seller_id = s.seller_id " +
            "JOIN buyer_data b ON a.buyer_id = b.buyer_id " +
            "JOIN stock_management st ON a.stock_id = st.stock_id " +
            "WHERE a.auction_id = ?",
            auctionId
        );
    }
}
