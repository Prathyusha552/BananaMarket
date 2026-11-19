
import { useEffect, useState } from 'react'

const API = 'http://localhost:8080/api/buyer-slip'

function getToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function formatMoney(value) {
  return `₹${Number(value || 0).toFixed(2)}`
}

async function readResponse(response) {
  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Login session expired. Please log in again.'
        : result.message || result.detail || 'Unable to load buyer slip'
    )
  }

  return result
}

function BuyerSlip() {
  const [marketDate, setMarketDate] = useState(getToday())
  const [buyers, setBuyers] = useState([])
  const [buyerId, setBuyerId] = useState('')
  const [summary, setSummary] = useState(null)

  const [buyersLoading, setBuyersLoading] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [error, setError] = useState('')

  // Load buyers for selected market date
  useEffect(() => {
    let cancelled = false

    async function loadBuyers() {
      setBuyersLoading(true)
      setSummaryLoading(false)
      setBuyers([])
      setBuyerId('')
      setSummary(null)
      setError('')

      try {
        const response = await fetch(
          `${API}/buyers?marketDate=${encodeURIComponent(marketDate)}`,
          {
            credentials: 'include'
          }
        )

        const data = await readResponse(response)

        if (cancelled) return

        const buyerList = Array.isArray(data) ? data : []

        setBuyers(buyerList)

        if (buyerList.length > 0) {
          setBuyerId(String(buyerList[0].buyer_id))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setBuyersLoading(false)
        }
      }
    }

    loadBuyers()

    return () => {
      cancelled = true
    }
  }, [marketDate])

  // Load selected buyer's purchase summary
  useEffect(() => {
    let cancelled = false

    async function loadSummary() {
      if (!buyerId) {
        setSummary(null)
        setSummaryLoading(false)
        return
      }

      setSummaryLoading(true)
      setSummary(null)
      setError('')

      try {
        const response = await fetch(
          `${API}/summary?buyerId=${encodeURIComponent(buyerId)}&marketDate=${encodeURIComponent(marketDate)}`,
          {
            credentials: 'include'
          }
        )

        const data = await readResponse(response)

        if (!cancelled) {
          setSummary(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false)
        }
      }
    }

    loadSummary()

    return () => {
      cancelled = true
    }
  }, [buyerId, marketDate])

  function handlePrint() {
    window.print()
  }

  const purchases = summary?.purchases || []
  const loading = buyersLoading || summaryLoading

  return (
    <div className="dashboard-content buyer-slip-page">

      {/* PRINT CSS */}
      <style>{`
        @media print {

          @page {
            size: A4 landscape;
            margin: 8mm;
          }

          html,
          body {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .buyer-slip-print,
          .buyer-slip-print * {
            visibility: visible !important;
          }

          .buyer-slip-print {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 5mm !important;
            box-sizing: border-box !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
          }

          .buyer-slip-print .no-print {
            display: none !important;
          }

          .buyer-slip-print .table-responsive {
            overflow: visible !important;
            width: 100% !important;
            max-width: none !important;
          }

          .buyer-slip-print table {
            width: 100% !important;
            min-width: 0 !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            font-size: 9px !important;
            margin-bottom: 0 !important;
          }

          .buyer-slip-print th,
          .buyer-slip-print td {
            border: 1px solid black !important;
            padding: 5px 3px !important;
            color: black !important;
            background: white !important;
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }

          .buyer-slip-print .summary-card {
            border: 1px solid black !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }

          .buyer-slip-print h3,
          .buyer-slip-print h4,
          .buyer-slip-print h5,
          .buyer-slip-print p,
          .buyer-slip-print small {
            color: black !important;
          }

          .buyer-slip-print .row {
            display: flex !important;
            flex-wrap: wrap !important;
          }

          .buyer-slip-print .col-md-3 {
            width: 25% !important;
          }

          .buyer-slip-print .col-6 {
            width: 25% !important;
          }

          .buyer-slip-print tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* PAGE HEADING */}
      <div className="page-heading no-print">
        <h2>Buyer Slip</h2>
        <p>View buyer-wise purchases and daily calculations.</p>
      </div>

      {/* FILTER SECTION */}
      <div className="dashboard-panel no-print">

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        <div className="row g-3">

          <div className="col-md-6">
            <label className="form-label">
              Market Date
            </label>

            <input
              type="date"
              className="form-control"
              value={marketDate}
              onChange={e => setMarketDate(e.target.value)}
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">
              Buyer Name
            </label>

            <select
              className="form-select"
              value={buyerId}
              disabled={buyersLoading || buyers.length === 0}
              onChange={e => setBuyerId(e.target.value)}
            >
              <option value="">
                Select buyer
              </option>

              {buyers.map(buyer => (
                <option
                  key={buyer.buyer_id}
                  value={buyer.buyer_id}
                >
                  {buyer.buyer_name}
                </option>
              ))}
            </select>
          </div>

        </div>

        {loading && (
          <div className="text-center py-4">
            <div className="spinner-border text-primary" />

            <p className="mt-2 text-muted">
              Loading buyer slip...
            </p>
          </div>
        )}

        {!buyersLoading && buyers.length === 0 && !error && (
          <div className="alert alert-info mt-4">
            No buyers have purchased on this market date.
          </div>
        )}

      </div>

      {/* SUMMARY LOADING */}
      {summaryLoading && (
        <div className="text-center py-4 no-print">
          Loading purchase details...
        </div>
      )}

      {/* BUYER SLIP */}
      {summary && !summaryLoading && (

        <div className="dashboard-panel mt-4 buyer-slip-print">

          {/* SLIP HEADER */}
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">

            <div>
              <h3 className="mb-2">
                BANANA MARKET
              </h3>

              <h4 className="mb-2">
                Buyer Purchase Slip
              </h4>

              <p className="mb-1">
                Market Date:{' '}
                <strong>{summary.market_date}</strong>
              </p>

              <p className="mb-0">
                Buyer Name:{' '}
                <strong>{summary.buyer_name}</strong>
              </p>
            </div>

            <button
              className="btn btn-primary px-4 no-print"
              onClick={handlePrint}
              disabled={purchases.length === 0}
            >
              Print Buyer Slip
            </button>

          </div>

          {/* TOTAL SUMMARY */}
          <div className="row g-3 mb-4">

            <div className="col-md-3 col-6">
              <div className="summary-card p-3">
                <p>Total Quantity</p>
                <h3>{summary.total_quantity}</h3>
                <small>Bunches</small>
              </div>
            </div>

            <div className="col-md-3 col-6">
              <div className="summary-card p-3">
                <p>Basic Amount</p>
                <h3>{formatMoney(summary.basic_amount)}</h3>
              </div>
            </div>

            <div className="col-md-3 col-6">
              <div className="summary-card p-3">
                <p>Buyer Charge</p>
                <h3>{formatMoney(summary.buyer_charge)}</h3>
              </div>
            </div>

            <div className="col-md-3 col-6">
              <div className="summary-card p-3">
                <p>Grand Total</p>
                <h3>{formatMoney(summary.grand_total)}</h3>
              </div>
            </div>

          </div>

          {/* PURCHASE TABLE */}
          <h5 className="mb-3">
            Rate-wise Purchase Details
          </h5>

          <div className="table-responsive">

            <table className="table table-bordered align-middle">

              <thead>
                <tr>
                  <th>Farmer Name</th>
                  <th>Delivery Date</th>
                  <th>Delivery Lot</th>
                  <th>Rate per Bunch</th>
                  <th>Quantity</th>
                  <th>Basic Amount</th>
                  <th>Buyer Charge</th>
                  <th>Grand Total</th>
                </tr>
              </thead>

              <tbody>

                {purchases.map((item, index) => (
                  <tr key={`${item.stock_id}-${item.price}-${index}`}>

                    <td>{item.seller_name}</td>

                    <td>{item.delivery_date}</td>

                    <td>{item.lot_id}</td>

                    <td>{formatMoney(item.price)}</td>

                    <td>{item.quantity}</td>

                    <td>{formatMoney(item.basic_amount)}</td>

                    <td>{formatMoney(item.buyer_charge)}</td>

                    <td>{formatMoney(item.grand_total)}</td>

                  </tr>
                ))}

              </tbody>

              <tfoot>
                <tr>
                  <th colSpan="4">Total</th>

                  <th>{summary.total_quantity}</th>

                  <th>{formatMoney(summary.basic_amount)}</th>

                  <th>{formatMoney(summary.buyer_charge)}</th>

                  <th>{formatMoney(summary.grand_total)}</th>
                </tr>
              </tfoot>

            </table>

          </div>

          {/* FINAL AMOUNT */}
          <div className="text-end mt-4">
            <h5>
              Total Payable:{' '}
              {formatMoney(summary.grand_total)}
            </h5>
          </div>

          {/* SIGNATURE */}
          <div className="mt-5 text-end">
            <p>
              Buyer Signature: ____________________
            </p>
          </div>

        </div>
      )}

    </div>
  )
}

export default BuyerSlip
