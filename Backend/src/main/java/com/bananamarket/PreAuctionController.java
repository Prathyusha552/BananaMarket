
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
@RequestMapping("/api/pre-auction")
@CrossOrigin(origins = "http://localhost:5173")
public class PreAuctionController {

    private final JdbcTemplate jdbcTemplate;

    public PreAuctionController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // GET ALL PRE-AUCTION REGISTRATIONS
    @GetMapping
    public List<Map<String, Object>> getPreAuctions() {

        return jdbcTemplate.queryForList(
            "SELECT p.pre_auction_id, p.market_date, " +
            "p.seller_id, s.seller_name, p.stock_id, " +
            "st.lot_id, st.delivery_date, " +
            "p.registered_qty, st.original_qty " +
            "FROM pre_auction p " +
            "JOIN seller_data s ON p.seller_id = s.seller_id " +
            "JOIN stock_management st ON p.stock_id = st.stock_id " +
            "ORDER BY p.market_date DESC, s.seller_name"
        );
    }

    // REGISTER EXISTING STOCK FOR AUCTION
    @PostMapping
    @Transactional
    public Map<String, Object> addPreAuction(
        @RequestBody Map<String, Object> data
    ) {

        String marketDate = String.valueOf(data.get("market_date"));

        int quantity = Integer.parseInt(
            String.valueOf(data.get("registered_qty"))
        );

        if (marketDate.equals("null")) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Market date is required"
            );
        }

        if (quantity <= 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Registered quantity must be greater than zero"
            );
        }

        LocalDate parsedMarketDate;

        try {
            parsedMarketDate = LocalDate.parse(marketDate);
        } catch (Exception e) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Invalid market date"
            );
        }

        Integer stockId = null;

        // Prefer the exact selected stock lot.
        if (data.get("stock_id") != null) {

            stockId = Integer.parseInt(
                data.get("stock_id").toString()
            );

        } else {

            // Backward compatibility with the existing frontend.
            // Resolve using farmer name and delivery date.
            String sellerName = String.valueOf(data.get("seller_name"));
            String deliveryDate = String.valueOf(data.get("delivery_date"));

            if (sellerName.equals("null") ||
                deliveryDate.equals("null")) {

                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Select an existing stock lot"
                );
            }

            List<Integer> matchingStocks = jdbcTemplate.queryForList(
                "SELECT st.stock_id " +
                "FROM stock_management st " +
                "JOIN seller_data s ON st.seller_id = s.seller_id " +
                "WHERE s.seller_name = ? COLLATE NOCASE " +
                "AND st.delivery_date = ? " +
                "ORDER BY st.stock_id",
                Integer.class,
                sellerName.trim(),
                deliveryDate
            );

            if (matchingStocks.isEmpty()) {
                throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Existing delivery lot not found"
                );
            }

            if (matchingStocks.size() > 1) {
                throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Multiple delivery lots found. Send the exact stock_id."
                );
            }

            stockId = matchingStocks.get(0);
        }

        // Find the existing delivery lot.
        List<Map<String, Object>> stocks = jdbcTemplate.queryForList(
            "SELECT stock_id, seller_id, lot_id, " +
            "delivery_date, original_qty " +
            "FROM stock_management WHERE stock_id = ?",
            stockId
        );

        if (stocks.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Selected stock lot does not exist"
            );
        }

        Map<String, Object> stock = stocks.get(0);

        int sellerId = ((Number) stock.get("seller_id")).intValue();
        int originalQty = ((Number) stock.get("original_qty")).intValue();

        String lotId = stock.get("lot_id").toString();
        String deliveryDate = stock.get("delivery_date").toString();

        if (parsedMarketDate.isBefore(LocalDate.parse(deliveryDate))) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Market date cannot be before delivery date"
            );
        }

        // Calculate how much has already been registered
        // against this delivery lot across all market dates.
        Integer totalRegistered = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(registered_qty), 0) " +
            "FROM pre_auction WHERE stock_id = ?",
            Integer.class,
            stockId
        );

        int alreadyRegistered =
            totalRegistered == null ? 0 : totalRegistered;

        // Include the existing same-day registration.
        Integer sameDayRegistered = jdbcTemplate.queryForObject(
            "SELECT COALESCE(SUM(registered_qty), 0) " +
            "FROM pre_auction " +
            "WHERE stock_id = ? AND market_date = ?",
            Integer.class,
            stockId,
            marketDate
        );

        int currentDayRegistered =
            sameDayRegistered == null ? 0 : sameDayRegistered;

        if (alreadyRegistered + quantity > originalQty) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Registration exceeds available unregistered quantity. " +
                "Available quantity: " +
                (originalQty - alreadyRegistered)
            );
        }

        // IMPORTANT:
        // Insert only into pre_auction.
        // Never create another stock_management row here.
        jdbcTemplate.update(
            "INSERT INTO pre_auction " +
            "(market_date, stock_id, seller_id, registered_qty) " +
            "VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(market_date, stock_id) " +
            "DO UPDATE SET registered_qty = " +
            "registered_qty + excluded.registered_qty",
            marketDate,
            stockId,
            sellerId,
            quantity
        );

        return Map.of(
            "message", "Pre-Auction registration successful",
            "stock_id", stockId,
            "seller_id", sellerId,
            "lot_id", lotId,
            "delivery_date", deliveryDate,
            "market_date", marketDate,
            "registered_today", currentDayRegistered + quantity,
            "total_registered", alreadyRegistered + quantity,
            "unregistered_qty",
                originalQty - alreadyRegistered - quantity
        );
    }
}
