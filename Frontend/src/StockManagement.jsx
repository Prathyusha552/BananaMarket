
import { useEffect, useState, useCallback } from 'react'

const API = 'http://localhost:8080/api/stock-management'

function getToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const createEmptyForm = () => ({
  seller_name: '',
  delivery_date: getToday(),
  original_qty: '',
  travel_allowance: '0'
})

async function apiRequest(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      signal: controller.signal
    })

    const text = await response.text()
    let data = {}

    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { message: text }
    }

    if (!response.ok) {
      throw new Error(
        response.status === 401 || response.status === 403
          ? 'Login session not accepted. Please log in again.'
          : data.message || data.error || `Request failed (${response.status})`
      )
    }

    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Check whether the backend is running.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function StockManagement() {
  const [marketDate, setMarketDate] = useState(getToday())
  const [stocks, setStocks] = useState([])

  const [form, setForm] = useState(createEmptyForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const [registeringId, setRegisteringId] = useState(null)
  const [registerQty, setRegisterQty] = useState('')

  const [tableLoading, setTableLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // LOAD STOCK TABLE

  const loadStocks = useCallback(async () => {
    setTableLoading(true)
    setError('')

    try {
      const data = await apiRequest(
        `${API}?marketDate=${encodeURIComponent(marketDate)}`
      )

      setStocks(Array.isArray(data) ? data : [])
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setTableLoading(false)
    }
  }, [marketDate])

  useEffect(() => {
    loadStocks()
  }, [loadStocks])

  // OPEN CREATE FORM

  function startCreate() {
    setEditingId(null)
    setForm(createEmptyForm())
    setError('')
    setMessage('')
    setShowForm(true)
  }

  // OPEN EDIT FORM

  function startEdit(stock) {
    setEditingId(stock.stock_id)

    setForm({
      seller_name: stock.seller_name || '',
      delivery_date: stock.delivery_date || getToday(),
      original_qty: String(stock.original_qty ?? ''),
      travel_allowance: String(stock.travel_allowance ?? 0)
    })

    setError('')
    setMessage('')
    setShowForm(true)
  }

  // CANCEL FORM

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(createEmptyForm())
    setError('')
    setMessage('')
  }

  // INPUT CHANGE

  function handleChange(event) {
    const { name, value } = event.target

    setForm(previous => ({
      ...previous,
      [name]: value
    }))
  }

  // SAVE OR UPDATE STOCK

  async function saveStock(event) {
    event.preventDefault()

    if (saving) return

    const sellerName = form.seller_name.trim()
    const quantity = Number(form.original_qty)
    const travelAllowance = Number(form.travel_allowance)

    if (!sellerName) {
      setError('Enter farmer name')
      return
    }

    if (!form.delivery_date) {
      setError('Select delivery date')
      return
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Enter a valid whole-number quantity greater than zero')
      return
    }

    if (
      form.travel_allowance.trim() === '' ||
      !Number.isFinite(travelAllowance) ||
      travelAllowance < 0
    ) {
      setError('Enter a valid travel allowance. It cannot be negative.')
      return
    }

    const payload = {
      seller_name: sellerName,
      delivery_date: form.delivery_date,
      original_qty: quantity,
      travel_allowance: travelAllowance
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const url = editingId !== null
        ? `${API}/${editingId}`
        : API

      const result = await apiRequest(url, {
        method: editingId !== null ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      setShowForm(false)
      setEditingId(null)
      setForm(createEmptyForm())

      setMessage(
        result.message || 'Stock saved successfully'
      )

      await loadStocks()

    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // REGISTER MORE STOCK

  async function registerMore(stockId) {
    if (registering) return

    const quantity = Number(registerQty)

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Enter a valid registration quantity')
      return
    }

    setRegistering(true)
    setError('')
    setMessage('')

    try {
      const result = await apiRequest(`${API}/${stockId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          market_date: marketDate,
          registered_qty: quantity
        })
      })

      setRegisteringId(null)
      setRegisterQty('')
      setMessage(result.message || 'Quantity registered successfully')

      await loadStocks()

    } catch (err) {
      setError(err.message)
    } finally {
      setRegistering(false)
    }
  }

  // DELETE STOCK

  async function deleteStock(stock) {
    if (deletingId !== null) return

    const confirmed = window.confirm(
      `Delete lot ${stock.lot_id} for ${stock.seller_name}?`
    )

    if (!confirmed) return

    setDeletingId(stock.stock_id)
    setError('')
    setMessage('')

    try {
      const result = await apiRequest(`${API}/${stock.stock_id}`, {
        method: 'DELETE'
      })

      setMessage(result.message || 'Stock deleted successfully')
      await loadStocks()

    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  // SUMMARY TOTALS

  const totals = stocks.reduce((result, stock) => {
    result.received += Number(stock.original_qty || 0)
    result.registered += Number(stock.registered_qty || 0)
    result.registeredToday += Number(stock.registered_today || 0)
    result.sold += Number(stock.sold_qty || 0)
    result.soldToday += Number(stock.sold_today || 0)
    result.unregistered += Number(stock.unregistered_qty || 0)
    result.unsold += Number(stock.registered_unsold_qty || 0)
    result.remaining += Number(stock.total_remaining_qty || 0)

    return result
  }, {
    received: 0,
    registered: 0,
    registeredToday: 0,
    sold: 0,
    soldToday: 0,
    unregistered: 0,
    unsold: 0,
    remaining: 0
  })

  return (
    <div className="container-fluid py-3">

      {/* HEADER */}

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
        <div>
          <h3 className="mb-1">Stock Management</h3>
          <p className="text-muted mb-0">
            Track deliveries, auction registrations, sales and remaining stock
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={startCreate}
        >
          + Add New Stock
        </button>
      </div>

      {/* MARKET DATE */}

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <label className="form-label fw-semibold">
            Select Market Date
          </label>

          <input
            type="date"
            className="form-control"
            style={{ maxWidth: '260px' }}
            value={marketDate}
            onChange={event => setMarketDate(event.target.value)}
          />
        </div>
      </div>

      {/* MESSAGES */}

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="alert alert-success" role="alert">
          {message}
        </div>
      )}

      {/* SUMMARY */}

      <div className="row g-3 mb-4">
        {[
          ['Total Received', totals.received],
          ['Registered Total', totals.registered],
          ['Registered Today', totals.registeredToday],
          ['Sold Total', totals.sold],
          ['Sold Today', totals.soldToday],
          ['Not Registered', totals.unregistered],
          ['Registered Unsold', totals.unsold],
          ['Total Remaining', totals.remaining]
        ].map(([label, value]) => (
          <div className="col-6 col-lg-3 col-xl" key={label}>
            <div className="card shadow-sm h-100">
              <div className="card-body">
                <div className="text-muted small">{label}</div>
                <h3 className="mb-0">{value}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE / EDIT FORM */}

      {showForm && (
        <div className="card shadow-sm mb-4">
          <div className="card-header fw-semibold">
            {editingId !== null ? 'Edit Stock Lot' : 'Create New Delivery Lot'}
          </div>

          <div className="card-body">
            <form onSubmit={saveStock}>
              <div className="row g-3">

                <div className="col-md-6">
                  <label className="form-label">Farmer Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="seller_name"
                    value={form.seller_name}
                    onChange={handleChange}
                    placeholder="Enter farmer name"
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Delivery Date</label>
                  <input
                    type="date"
                    className="form-control"
                    name="delivery_date"
                    value={form.delivery_date}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">Total Received Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="form-control"
                    name="original_qty"
                    value={form.original_qty}
                    onChange={handleChange}
                    placeholder="Enter total received bunches"
                    required
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">
                    Travel Allowance (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    name="travel_allowance"
                    value={form.travel_allowance}
                    onChange={handleChange}
                    placeholder="Enter delivery travel allowance"
                    required
                  />
                  <div className="form-text">
                    This amount is saved for this delivery lot and automatically
                    deducted in its Seller Slip.
                  </div>
                </div>

                {editingId === null && (
                  <div className="col-12">
                    <div className="alert alert-info mb-0">
                      <strong>Important:</strong> This records the delivery only.
                      Register the required quantity separately in Pre-Auction.
                    </div>
                  </div>
                )}

                {editingId !== null && (
                  <div className="col-12">
                    <div className="form-text">
                      Quantity cannot be lower than quantities already registered or sold.
                      Travel allowance belongs to this delivery lot.
                    </div>
                  </div>
                )}

                <div className="col-12 d-flex gap-2">
                  <button
                    type="submit"
                    className="btn btn-success"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Stock'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={cancelForm}
                  >
                    Cancel
                  </button>
                </div>

              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK TABLE */}

      <div className="card shadow-sm">
        <div className="card-header fw-semibold">
          Delivery Stock Lots
        </div>

        <div className="table-responsive">
          <table className="table table-bordered table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Farmer</th>
                <th>Lot ID</th>
                <th>Delivery Date</th>
                <th>Received</th>
                <th>Travel Allowance (₹)</th>
                <th>Registered Total</th>
                <th>Registered Today</th>
                <th>Sold Total</th>
                <th>Sold Today</th>
                <th>Not Registered</th>
                <th>Registered Unsold</th>
                <th>Total Remaining</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {tableLoading && stocks.length === 0 && (
                <tr>
                  <td colSpan="14" className="text-center py-4">
                    Loading stock...
                  </td>
                </tr>
              )}

              {!tableLoading && stocks.length === 0 && (
                <tr>
                  <td colSpan="14" className="text-center text-muted py-4">
                    No stock lots found for this date.
                  </td>
                </tr>
              )}

              {stocks.map(stock => {
                const registeredUnsold =
                  Number(stock.registered_unsold_qty || 0)

                const unregistered =
                  Number(stock.unregistered_qty || 0)

                const status = registeredUnsold > 0
                  ? 'Available for auction'
                  : unregistered > 0
                    ? 'Not fully registered'
                    : 'Completed'

                return (
                  <tr key={stock.stock_id}>
                    <td className="fw-semibold">{stock.seller_name}</td>
                    <td>{stock.lot_id}</td>
                    <td>{stock.delivery_date}</td>
                    <td>{stock.original_qty}</td>
                    <td>
                      ₹{Number(stock.travel_allowance || 0).toFixed(2)}
                    </td>
                    <td>{stock.registered_qty}</td>
                    <td>{stock.registered_today}</td>
                    <td>{stock.sold_qty}</td>
                    <td>{stock.sold_today}</td>
                    <td>{stock.unregistered_qty}</td>
                    <td>{stock.registered_unsold_qty}</td>
                    <td>{stock.total_remaining_qty}</td>

                    <td>
                      <span className={
                        registeredUnsold > 0
                          ? 'badge bg-success'
                          : unregistered > 0
                            ? 'badge bg-warning text-dark'
                            : 'badge bg-secondary'
                      }>
                        {status}
                      </span>
                    </td>

                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => startEdit(stock)}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => {
                            setRegisteringId(
                              registeringId === stock.stock_id
                                ? null
                                : stock.stock_id
                            )
                            setRegisterQty('')
                            setError('')
                          }}
                          disabled={unregistered <= 0 || registering}
                        >
                          Register More
                        </button>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => deleteStock(stock)}
                          disabled={deletingId === stock.stock_id}
                        >
                          {deletingId === stock.stock_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>

                      {registeringId === stock.stock_id && (
                        <div className="mt-2" style={{ minWidth: '190px' }}>
                          <input
                            type="number"
                            min="1"
                            max={unregistered}
                            step="1"
                            className="form-control form-control-sm mb-1"
                            placeholder={`Max ${unregistered}`}
                            value={registerQty}
                            onChange={event => setRegisterQty(event.target.value)}
                          />

                          <button
                            type="button"
                            className="btn btn-sm btn-success me-1"
                            onClick={() => registerMore(stock.stock_id)}
                            disabled={registering}
                          >
                            {registering ? 'Registering...' : 'Confirm'}
                          </button>

                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => {
                              setRegisteringId(null)
                              setRegisterQty('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

export default StockManagement
