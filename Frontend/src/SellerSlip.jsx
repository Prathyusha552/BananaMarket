
import { useEffect, useState } from 'react'

const API = 'http://localhost:8080/api/seller-slip'

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

async function readResponse(response) {
  const text = await response.text()
  let data

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Login session expired. Please log in again.'
        : typeof data === 'string'
          ? data
          : data?.message || data?.error || 'Request failed'
    )
  }

  return data
}

function SellerSlip() {
  const [sellers, setSellers] = useState([])
  const [sellerId, setSellerId] = useState('')
  const [deliveries, setDeliveries] = useState([])
  const [selectedStockId, setSelectedStockId] = useState('')
  const [summary, setSummary] = useState(null)

  const [loadingSellers, setLoadingSellers] = useState(false)
  const [loadingDeliveries, setLoadingDeliveries] = useState(false)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [completing, setCompleting] = useState(false)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSellers()
  }, [])

  useEffect(() => {
    if (sellerId) {
      loadDeliveries(sellerId)
    } else {
      setDeliveries([])
      setSelectedStockId('')
      setSummary(null)
    }
  }, [sellerId])

  async function loadSellers() {
    try {
      setLoadingSellers(true)
      setError('')

      const response = await fetch(`${API}/sellers`, {
        credentials: 'include'
      })

      const data = await readResponse(response)

      setSellers(Array.isArray(data) ? data : [])

      if (Array.isArray(data) && data.length > 0) {
        setSellerId(String(data[0].seller_id))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingSellers(false)
    }
  }

  async function loadDeliveries(id) {
    try {
      setLoadingDeliveries(true)
      setError('')
      setMessage('')
      setSummary(null)
      setSelectedStockId('')

      const response = await fetch(
        `${API}/deliveries?sellerId=${encodeURIComponent(id)}`,
        {
          credentials: 'include'
        }
      )

      const data = await readResponse(response)
      setDeliveries(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message)
      setDeliveries([])
    } finally {
      setLoadingDeliveries(false)
    }
  }

  async function openDelivery(stockId) {
    try {
      setLoadingSummary(true)
      setError('')
      setMessage('')
      setSummary(null)
      setSelectedStockId(String(stockId))

      const response = await fetch(
        `${API}/summary?stockId=${encodeURIComponent(stockId)}`,
        {
          credentials: 'include'
        }
      )

      const data = await readResponse(response)
      setSummary(data)
    } catch (err) {
      setError(err.message)
      setSelectedStockId('')
    } finally {
      setLoadingSummary(false)
    }
  }

  async function completeSlip() {
    if (!summary || summary.completed) return

    const confirmed = window.confirm(
      `Complete the Seller Slip for ${summary.delivery_date}?\n\n` +
      'This will move only this delivery into Completed History.'
    )

    if (!confirmed) return

    try {
      setCompleting(true)
      setError('')
      setMessage('')

      const response = await fetch(
        `${API}/${summary.stock_id}/complete`,
        {
          method: 'POST',
          credentials: 'include'
        }
      )

      await readResponse(response)

      setMessage('Seller Slip completed successfully.')

      await loadDeliveries(sellerId)
      await openDelivery(summary.stock_id)
    } catch (err) {
      setError(err.message)
    } finally {
      setCompleting(false)
    }
  }

  const pendingDeliveries = deliveries.filter(
    delivery => !delivery.completed
  )

  const completedDeliveries = deliveries.filter(
    delivery => delivery.completed
  )

  // Group bunches by auction date and selling rate.
  // Same date + same rate = one row.
  const groupedBunchPrices = Object.values(
    (summary?.bunch_prices || []).reduce((groups, bunch) => {
      const date = bunch.auction_date || ''
      const price = Number(bunch.price || 0)
      const key = `${date}_${price}`

      if (!groups[key]) {
        groups[key] = {
          auction_date: date,
          price,
          quantity: 0,
          total: 0
        }
      }

      groups[key].quantity += 1
      groups[key].total += price

      return groups
    }, {})
  ).sort((a, b) => {
    const dateCompare = String(a.auction_date).localeCompare(
      String(b.auction_date)
    )

    if (dateCompare !== 0) return dateCompare

    return b.price - a.price
  })

  const groupedTotalQuantity = groupedBunchPrices.reduce(
    (total, row) => total + row.quantity,
    0
  )

  const groupedGrossAmount = groupedBunchPrices.reduce(
    (total, row) => total + row.total,
    0
  )

  return (
    <div className="seller-slip-page">

      <div className="page-heading">
        <h2>Seller Slip</h2>
        <p>Delivery-wise farmer settlement and payment details.</p>
      </div>

      <div className="seller-slip-filters">
        <div className="form-group">
          <label>Farmer Name</label>

          <select
            value={sellerId}
            disabled={loadingSellers}
            onChange={e => setSellerId(e.target.value)}
          >
            <option value="">Select Farmer</option>

            {sellers.map(seller => (
              <option
                key={seller.seller_id}
                value={seller.seller_id}
              >
                {seller.seller_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="error-message" style={{ color: 'red' }}>
          {error}
        </p>
      )}

      {message && (
        <p style={{ color: 'green', fontWeight: 'bold' }}>
          {message}
        </p>
      )}

      {loadingDeliveries && <p>Loading delivery dates...</p>}

      {!loadingDeliveries && sellerId && (
        <div className="seller-delivery-lists">

          <div className="delivery-section">
            <h3>Pending Delivery Slips</h3>

            {pendingDeliveries.length === 0 ? (
              <p>No pending delivery slips for this farmer.</p>
            ) : (
              <div className="delivery-list">
                {pendingDeliveries.map(delivery => (
                  <div
                    className="delivery-card"
                    key={delivery.stock_id}
                  >
                    <div>
                      <strong>{delivery.delivery_label}</strong>
                      <p>Lot ID: {delivery.lot_id}</p>
                      <p>Sold bunches: {delivery.sold_qty}</p>
                      <p>Gross income: {formatMoney(delivery.gross_amount)}</p>
                      <p>
                        Travel allowance:{' '}
                        {formatMoney(delivery.travel_allowance)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openDelivery(delivery.stock_id)}
                    >
                      View Slip
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="delivery-section">
            <h3>Completed Delivery Slips</h3>

            {completedDeliveries.length === 0 ? (
              <p>No completed slips yet.</p>
            ) : (
              <div className="delivery-list">
                {completedDeliveries.map(delivery => (
                  <div
                    className="delivery-card completed-card"
                    key={delivery.stock_id}
                  >
                    <div>
                      <strong>{delivery.delivery_label}</strong>
                      <p>Lot ID: {delivery.lot_id}</p>
                      <p>Sold bunches: {delivery.sold_qty}</p>
                      <p>Gross income: {formatMoney(delivery.gross_amount)}</p>
                      <p>
                        Travel allowance:{' '}
                        {formatMoney(delivery.travel_allowance)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => openDelivery(delivery.stock_id)}
                    >
                      View / Print
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {loadingSummary && <p>Loading seller slip...</p>}

      {summary && !loadingSummary && (
        <div className="seller-slip-result">

          <div className="seller-slip-print">

            <div className="seller-slip-header">
              <h2>Banana Market</h2>
              <h3>Farmer Settlement Slip</h3>

              <p>
                Farmer Name: <strong>{summary.seller_name}</strong>
              </p>

              <p>
                Delivery Date: <strong>{summary.delivery_date}</strong>
              </p>

              <p>
                Delivery Identification:{' '}
                <strong>
                  {
                    deliveries.find(
                      d => Number(d.stock_id) === Number(summary.stock_id)
                    )?.delivery_label || summary.delivery_date
                  }
                </strong>
              </p>

              <p>Delivery ID: {summary.lot_id}</p>

              <p>
                Status:{' '}
                <strong>
                  {summary.completed ? 'COMPLETED' : 'PENDING'}
                </strong>
              </p>
            </div>

            <hr />

            <h3>1. Rate-wise Selling Details</h3>

            <div className="table-responsive">
              <table className="table seller-slip-table">
                <thead>
                  <tr>
                    <th>Auction Date</th>
                    <th>Quantity</th>
                    <th>Rate per bunch</th>
                    <th>Total Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {groupedBunchPrices.length > 0 ? (
                    <>
                      {groupedBunchPrices.map((row, index) => (
                        <tr key={`${row.auction_date}_${row.price}_${index}`}>
                          <td>{row.auction_date}</td>
                          <td>{row.quantity}</td>
                          <td>{formatMoney(row.price)}</td>
                          <td>{formatMoney(row.total)}</td>
                        </tr>
                      ))}

                      <tr className="seller-slip-total-row">
                        <td><strong>Total</strong></td>
                        <td><strong>{groupedTotalQuantity}</strong></td>
                        <td></td>
                        <td><strong>{formatMoney(groupedGrossAmount)}</strong></td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan="4">No sales found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <hr />

            <h3>2. Farmer Settlement Calculation</h3>

            <table className="table seller-slip-table">
              <tbody>
                <tr>
                  <td>Total sold bunches</td>
                  <td>{summary.total_quantity}</td>
                </tr>

                <tr>
                  <td>Gross lot income</td>
                  <td>{formatMoney(summary.gross_amount)}</td>
                </tr>

                <tr>
                  <td>Commission (12%)</td>
                  <td>{formatMoney(summary.commission)}</td>
                </tr>

                <tr>
                  <td>Deduction (₹3 × bunches)</td>
                  <td>{formatMoney(summary.deduction_3)}</td>
                </tr>

                <tr>
                  <td>Deduction (₹4 × bunches)</td>
                  <td>{formatMoney(summary.deduction_4)}</td>
                </tr>

                <tr>
                  <td>
                    <strong>Travel Allowance (delivery-wise)</strong>
                  </td>
                  <td>
                    <strong>{formatMoney(summary.travel_allowance)}</strong>
                  </td>
                </tr>

                <tr>
                  <td><strong>Total deductions</strong></td>
                  <td>
                    <strong>
                      {formatMoney(summary.total_deductions)}
                    </strong>
                  </td>
                </tr>

                <tr>
                  <td><strong>Final farmer net amount</strong></td>
                  <td>
                    <strong>
                      {formatMoney(summary.net_amount)}
                    </strong>
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="seller-slip-signature">
              <p>Farmer Signature: ____________________</p>
              <p>Authorized Signature: ____________________</p>
            </div>

          </div>

          <div className="seller-slip-actions">
            <button
              type="button"
              onClick={() => window.print()}
            >
              Print Seller Slip
            </button>

            {!summary.completed && (
              <button
                type="button"
                onClick={completeSlip}
                disabled={completing}
              >
                {completing ? 'Completing...' : 'Complete Slip'}
              </button>
            )}

            {summary.completed && (
              <strong style={{ color: 'green' }}>
                This delivery slip is completed.
              </strong>
            )}
          </div>

        </div>
      )}

      <style>{`
        .seller-slip-page {
          width: 100%;
        }

        .seller-delivery-lists {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }

        .delivery-section {
          padding: 18px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #fff;
        }

        .delivery-section h3 {
          margin-bottom: 15px;
        }

        .delivery-list {
          display: grid;
          gap: 12px;
        }

        .delivery-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border: 1px solid #ddd;
          border-radius: 6px;
        }

        .delivery-card p {
          margin: 4px 0;
          font-size: 13px;
        }

        .delivery-card button,
        .seller-slip-actions button {
          padding: 9px 14px;
          border: none;
          border-radius: 5px;
          background: #198754;
          color: white;
          cursor: pointer;
        }

        .delivery-card button:disabled,
        .seller-slip-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .completed-card {
          background: #f2faf4;
        }

        .seller-slip-result {
          margin-top: 25px;
          padding: 20px;
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 8px;
        }

        .seller-slip-header {
          text-align: center;
        }

        .seller-slip-table {
          width: 100%;
          border-collapse: collapse;
        }

        .seller-slip-table th,
        .seller-slip-table td {
          padding: 9px;
          border: 1px solid #ddd;
        }

        .seller-slip-table th {
          background: #f1f1f1;
        }

        .seller-slip-total-row {
          background: #f5f5f5;
        }

        .seller-slip-total-row td {
          border-top: 2px solid #555;
        }

        .seller-slip-signature {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-top: 45px;
        }

        .seller-slip-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          flex-wrap: wrap;
        }

        @media (max-width: 600px) {
          .seller-slip-result {
            padding: 12px;
          }

          .seller-slip-signature {
            flex-direction: column;
            gap: 5px;
          }

          .seller-slip-table th,
          .seller-slip-table td {
            padding: 6px;
            font-size: 12px;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          .seller-slip-print,
          .seller-slip-print * {
            visibility: visible !important;
          }

          .seller-slip-print {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            border: none;
          }

          .seller-slip-actions,
          .seller-delivery-lists,
          .seller-slip-filters,
          .page-heading {
            display: none !important;
          }

          .seller-slip-table {
            width: 100%;
            border-collapse: collapse !important;
          }

          .seller-slip-table th,
          .seller-slip-table td {
            border: 1px solid #555 !important;
            padding: 6px !important;
            color: #000 !important;
          }

          .seller-slip-table th {
            background: #eee !important;
          }

          .seller-slip-total-row {
            background: #eee !important;
          }

          .seller-slip-signature {
            margin-top: 45px;
          }

          tr {
            break-inside: avoid;
          }
        }
      `}</style>

    </div>
  )
}

export default SellerSlip
