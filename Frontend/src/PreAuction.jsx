
import { useEffect, useState } from 'react'

const API = 'http://localhost:8080/api'

function getToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function PreAuction() {
  const [records, setRecords] = useState([])
  const [stockLots, setStockLots] = useState([])

  const [form, setForm] = useState({
    market_date: getToday(),
    stock_id: '',
    registered_qty: '',
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Load all Pre-Auction registrations
  const loadRecords = async () => {
    const response = await fetch(`${API}/pre-auction`, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(
        response.status === 401 || response.status === 403
          ? 'Login session not accepted. Please log in again.'
          : 'Unable to load Pre-Auction records'
      )
    }

    setRecords(await response.json())
  }

  // Load existing stock lots for the selected market date
  const loadStockLots = async (marketDate) => {
    const response = await fetch(
      `${API}/stock-management?marketDate=${marketDate}`,
      {
        credentials: 'include',
      }
    )

    if (!response.ok) {
      throw new Error('Unable to load existing stock lots')
    }

    const data = await response.json()

    // Only lots with unregistered quantity can be selected
    setStockLots(
      data.filter(
        lot => Number(lot.unregistered_qty) > 0
      )
    )
  }

  useEffect(() => {
    const initialize = async () => {
      try {
        setError('')
        await Promise.all([
          loadRecords(),
          loadStockLots(form.market_date),
        ])
      } catch (err) {
        setError(err.message)
      }
    }

    initialize()
  }, [])

  // Refresh stock lots when market date changes
  const handleMarketDateChange = async (event) => {
    const marketDate = event.target.value

    setForm(prev => ({
      ...prev,
      market_date: marketDate,
      stock_id: '',
    }))

    setMessage('')
    setError('')

    try {
      await loadStockLots(marketDate)
    } catch (err) {
      setError(err.message)
    }
  }

  const selectedLot = stockLots.find(
    lot => String(lot.stock_id) === String(form.stock_id)
  )

  const handleSubmit = async (event) => {
    event.preventDefault()

    setMessage('')
    setError('')

    if (!form.stock_id) {
      setError('Please select an existing stock lot')
      return
    }

    const quantity = Number(form.registered_qty)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Enter a valid registration quantity')
      return
    }

    if (!selectedLot) {
      setError('Selected stock lot is not available')
      return
    }

    if (quantity > Number(selectedLot.unregistered_qty)) {
      setError(
        `Only ${selectedLot.unregistered_qty} bunches are available for registration`
      )
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API}/pre-auction`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          market_date: form.market_date,
          stock_id: Number(form.stock_id),
          registered_qty: quantity,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result.message || result.error ||
          'Pre-Auction registration failed'
        )
      }

      setMessage(
        `Registration successful! Lot: ${result.lot_id}, Registered: ${quantity}`
      )

      setForm(prev => ({
        ...prev,
        stock_id: '',
        registered_qty: '',
      }))

      // Refresh both screens' data
      await Promise.all([
        loadRecords(),
        loadStockLots(form.market_date),
      ])

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="dashboard-content">

      <div className="page-heading">
        <h2>Pre-Auction Registration</h2>
        <p>
          Register quantities against existing Stock Management deliveries.
        </p>
      </div>

      <div className="dashboard-panel mb-4">

        <h5 className="mb-3">Register Existing Delivery</h5>

        {message && (
          <div className="alert alert-success">
            {message}
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div className="row g-3">

            <div className="col-md-6">
              <label className="form-label">Market Date</label>

              <input
                type="date"
                className="form-control"
                value={form.market_date}
                onChange={handleMarketDateChange}
                required
              />
            </div>

            <div className="col-md-6">
              <label className="form-label">Select Existing Stock Lot</label>

              <select
                className="form-select"
                value={form.stock_id}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    stock_id: event.target.value,
                  }))
                }
                required
              >
                <option value="">Select farmer / delivery lot</option>

                {stockLots.map(lot => (
                  <option
                    key={lot.stock_id}
                    value={lot.stock_id}
                  >
                    {lot.seller_name} | {lot.lot_id} |
                    Delivery: {lot.delivery_date} |
                    Available: {lot.unregistered_qty}
                  </option>
                ))}
              </select>

              {stockLots.length === 0 && (
                <small className="text-muted">
                  No unregistered stock available for this market date.
                </small>
              )}
            </div>

            {selectedLot && (
              <>
                <div className="col-md-3">
                  <label className="form-label">Original Quantity</label>
                  <input
                    className="form-control"
                    value={selectedLot.original_qty}
                    readOnly
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Already Registered</label>
                  <input
                    className="form-control"
                    value={selectedLot.registered_qty}
                    readOnly
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Already Sold</label>
                  <input
                    className="form-control"
                    value={selectedLot.sold_qty}
                    readOnly
                  />
                </div>

                <div className="col-md-3">
                  <label className="form-label">Unregistered Available</label>
                  <input
                    className="form-control"
                    value={selectedLot.unregistered_qty}
                    readOnly
                  />
                </div>
              </>
            )}

            <div className="col-md-6">
              <label className="form-label">
                Register Quantity (Bunches)
              </label>

              <input
                type="number"
                className="form-control"
                min="1"
                max={selectedLot?.unregistered_qty || undefined}
                value={form.registered_qty}
                onChange={event =>
                  setForm(prev => ({
                    ...prev,
                    registered_qty: event.target.value,
                  }))
                }
                placeholder="Enter registration quantity"
                required
              />
            </div>

          </div>

          <button
            type="submit"
            className="btn btn-success mt-4"
            disabled={loading || stockLots.length === 0}
          >
            {loading ? 'Saving...' : 'Save Registration'}
          </button>

        </form>
      </div>

      <div className="dashboard-panel">

        <h5>Pre-Auction Registration History</h5>

        <div className="table-responsive mt-3">

          <table className="table table-hover">

            <thead>
              <tr>
                <th>Market Date</th>
                <th>Farmer</th>
                <th>Delivery Date</th>
                <th>Lot Number</th>
                <th>Original Qty</th>
                <th>Registered Qty</th>
              </tr>
            </thead>

            <tbody>

              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="text-center text-muted py-4"
                  >
                    No registrations available.
                  </td>
                </tr>
              ) : (
                records.map(record => (
                  <tr key={record.pre_auction_id}>
                    <td>{record.market_date}</td>
                    <td>{record.seller_name}</td>
                    <td>{record.delivery_date}</td>
                    <td>{record.lot_id}</td>
                    <td>{record.original_qty}</td>
                    <td>{record.registered_qty}</td>
                  </tr>
                ))
              )}

            </tbody>

          </table>

        </div>
      </div>

    </div>
  )
}

export default PreAuction
