
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

function SellerPaymentSlip() {
  const [sellers, setSellers] = useState([])
  const [sellerId, setSellerId] = useState('')
  const [deliveries, setDeliveries] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [completingId, setCompletingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    loadSellers()
  }, [])

  useEffect(() => {
    if (sellerId) {
      loadDeliveries(sellerId)
    } else {
      setDeliveries([])
      setSummary(null)
    }
  }, [sellerId])

  async function loadSellers() {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(`${API}/sellers`, {
        credentials: 'include'
      })

      const data = await readResponse(response)

      const sellerList = Array.isArray(data) ? data : []

      setSellers(sellerList)

      if (sellerList.length > 0) {
        setSellerId(String(sellerList[0].seller_id))
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadDeliveries(id) {
    try {
      setLoading(true)
      setError('')

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
      setLoading(false)
    }
  }

  async function openSlip(id, printAfterLoad = false) {
    try {
      setLoading(true)
      setError('')

      const response = await fetch(
        `${API}/summary?stockId=${encodeURIComponent(id)}`,
        {
          credentials: 'include'
        }
      )

      const data = await readResponse(response)
      setSummary(data)

      if (printAfterLoad) {
        window.setTimeout(() => window.print(), 300)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function completeDelivery(id) {
    const confirmed = window.confirm(
      'Mark this delivery as completed? It will move to Completed Deliveries.'
    )

    if (!confirmed) return

    try {
      setCompletingId(String(id))
      setError('')
      setNotice('')

      const response = await fetch(
        `${API}/${encodeURIComponent(id)}/complete`,
        {
          method: 'POST',
          credentials: 'include'
        }
      )

      await readResponse(response)

      await loadDeliveries(sellerId)
      setSummary(null)
      setNotice('Delivery marked as completed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setCompletingId('')
    }
  }

  const pending = deliveries.filter(item => !item.completed)
  const completed = deliveries.filter(item => item.completed)

  function DeliveryCard({ delivery, isCompleted }) {
    return (
      <div className="payment-delivery-card">
        <div className="payment-delivery-details">
          <strong>
            {delivery.delivery_label || delivery.delivery_date}
          </strong>

          <p>Lot ID: {delivery.lot_id}</p>
          <p>Sold quantity: {delivery.sold_qty}</p>
          <p>Status: {isCompleted ? 'Completed' : 'Pending'}</p>
        </div>

        <div className="payment-delivery-actions">
          <button
            type="button"
            className="payment-view-button"
            onClick={() => openSlip(delivery.stock_id)}
          >
            View
          </button>

          {isCompleted ? (
            <button
              type="button"
              className="payment-print-button"
              onClick={() => openSlip(delivery.stock_id, true)}
            >
              Print
            </button>
          ) : (
            <button
              type="button"
              className="payment-complete-button"
              disabled={completingId === String(delivery.stock_id)}
              onClick={() => completeDelivery(delivery.stock_id)}
            >
              {completingId === String(delivery.stock_id)
                ? 'Completing...'
                : 'Complete'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="payment-slip-page">

      <div className="page-heading">
        <h2>Seller Payment Slip</h2>
        <p>Simple farmer payment summary.</p>
      </div>

      <div className="payment-slip-filters">
        <label>
          Farmer Name

          <select
            value={sellerId}
            disabled={loading && sellers.length === 0}
            onChange={e => {
              setSellerId(e.target.value)
              setSummary(null)
              setNotice('')
            }}
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
        </label>
      </div>

      {error && <p className="error-message">{error}</p>}
      {notice && <p className="payment-notice">{notice}</p>}
      {loading && <p>Loading...</p>}

      {sellerId && !loading && (
        <div className="payment-deliveries">

          <section className="payment-delivery-section">
            <h3>Pending Deliveries</h3>

            {pending.length === 0 ? (
              <p>No pending deliveries for this farmer.</p>
            ) : (
              pending.map(delivery => (
                <DeliveryCard
                  key={delivery.stock_id}
                  delivery={delivery}
                  isCompleted={false}
                />
              ))
            )}
          </section>

          <section className="payment-delivery-section">
            <h3>Completed Deliveries</h3>

            {completed.length === 0 ? (
              <p>No completed deliveries for this farmer.</p>
            ) : (
              completed.map(delivery => (
                <DeliveryCard
                  key={delivery.stock_id}
                  delivery={delivery}
                  isCompleted={true}
                />
              ))
            )}
          </section>

        </div>
      )}

      {summary && !loading && (
        <div className="payment-slip-result">

          <div className="payment-slip-print">

            <header>
              <h2>BANANA MARKET</h2>
              <h3>SELLER PAYMENT SLIP</h3>
            </header>

            <div className="payment-info">

              <p>
                Farmer Name:
                <strong>{summary.seller_name}</strong>
              </p>

              <p>
                Delivery Date:
                <strong>{summary.delivery_date}</strong>
              </p>

              <p>
                Lot ID:
                <strong>{summary.lot_id}</strong>
              </p>

              <p>
                Status:
                <strong>
                  {summary.completed ? 'COMPLETED' : 'PENDING'}
                </strong>
              </p>

            </div>

            <table>
              <tbody>

                <tr>
                  <td>Total Quantity</td>
                  <td>{summary.total_quantity} bunches</td>
                </tr>

                <tr>
                  <td>Gross Amount</td>
                  <td>{formatMoney(summary.gross_amount)}</td>
                </tr>

                <tr>
                  <td>12% Commission</td>
                  <td>{formatMoney(summary.commission)}</td>
                </tr>

                <tr>
                  <td>₹3 per bunch deduction</td>
                  <td>{formatMoney(summary.deduction_3)}</td>
                </tr>

                <tr>
                  <td>₹4 per bunch deduction</td>
                  <td>{formatMoney(summary.deduction_4)}</td>
                </tr>

                <tr>
                  <td>Travel Allowance</td>
                  <td>{formatMoney(summary.travel_allowance)}</td>
                </tr>

                <tr className="total-deductions">
                  <td>Total Deductions</td>
                  <td>{formatMoney(summary.total_deductions)}</td>
                </tr>

                <tr className="final-payment">
                  <td>FINAL PAYMENT</td>
                  <td>{formatMoney(summary.net_amount)}</td>
                </tr>

              </tbody>
            </table>

            <div className="payment-signatures">
              <span>Farmer Signature: ______________</span>
              <span>Authorized Signature: ______________</span>
            </div>

          </div>

          <div className="payment-slip-actions">
            <button
              type="button"
              onClick={() => window.print()}
            >
              Print Payment Slip
            </button>
          </div>

        </div>
      )}

      <style>{`
        .payment-slip-page {
          width: 100%;
        }

        .payment-slip-filters {
          margin: 20px 0;
        }

        .payment-slip-filters label {
          display: grid;
          gap: 8px;
          max-width: 350px;
          font-weight: 600;
        }

        .payment-slip-filters select {
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 5px;
        }

        .payment-deliveries {
          margin: 20px 0;
        }

        .payment-delivery-section {
          margin: 24px 0;
        }

        .payment-delivery-section h3 {
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #ddd;
        }

        .payment-delivery-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          padding: 14px;
          margin: 10px 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 7px;
        }

        .payment-delivery-card p {
          margin: 5px 0;
          font-size: 13px;
        }

        .payment-delivery-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .payment-delivery-actions button,
        .payment-slip-actions button {
          padding: 10px 16px;
          border: none;
          border-radius: 5px;
          color: white;
          cursor: pointer;
        }

        .payment-delivery-actions button:disabled {
          opacity: .6;
          cursor: wait;
        }

        .payment-view-button {
          background: #315b8a;
        }

        .payment-print-button,
        .payment-slip-actions button {
          background: #198754;
        }

        .payment-complete-button {
          background: #6c757d;
        }

        .payment-notice {
          color: #198754;
          font-weight: 600;
        }

        .payment-slip-result {
          margin-top: 20px;
          padding: 20px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
        }

        .payment-slip-print header {
          text-align: center;
          margin-bottom: 25px;
        }

        .payment-info {
          margin-bottom: 20px;
        }

        .payment-info p {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          padding: 7px 0;
          border-bottom: 1px solid #eee;
        }

        .payment-slip-print table {
          width: 100%;
          border-collapse: collapse;
        }

        .payment-slip-print td {
          padding: 12px;
          border: 1px solid #ccc;
        }

        .payment-slip-print td:last-child {
          text-align: right;
          font-weight: 600;
        }

        .total-deductions {
          font-weight: bold;
          background: #f1f1f1;
        }

        .final-payment {
          font-size: 18px;
          font-weight: bold;
          background: #e8f3eb;
        }

        .payment-signatures {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          margin-top: 55px;
        }

        .payment-slip-actions {
          margin-top: 20px;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          .payment-slip-print,
          .payment-slip-print * {
            visibility: visible !important;
          }

          .payment-slip-print {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }

          .payment-slip-actions,
          .payment-deliveries,
          .payment-slip-filters,
          .page-heading {
            display: none !important;
          }
        }

        @media (max-width: 600px) {
          .payment-delivery-card,
          .payment-signatures {
            flex-direction: column;
            align-items: flex-start;
          }

          .payment-info p {
            flex-wrap: wrap;
          }

          .payment-delivery-actions {
            width: 100%;
          }
        }
      `}</style>

    </div>
  )
}

export default SellerPaymentSlip
