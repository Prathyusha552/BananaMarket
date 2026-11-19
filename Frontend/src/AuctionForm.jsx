
import { useEffect, useState, useRef } from 'react'

const API = 'http://localhost:8080/api'

function getToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  })

  const text = await response.text()
  let result = {}

  try {
    result = text ? JSON.parse(text) : {}
  } catch {
    result = { message: text }
  }

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Login session expired. Please log in again.'
        : result.message || result.error || `Request failed (${response.status})`
    )
  }

  return result
}

function AuctionForm() {
  const [marketDate, setMarketDate] = useState(getToday())
  const [lots, setLots] = useState([])
  const [buyers, setBuyers] = useState([])
  const [entries, setEntries] = useState([])

  const [selectedSellerId, setSelectedSellerId] = useState('')
  const [selectedStockId, setSelectedStockId] = useState('')
  const [buyerName, setBuyerName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editBuyer, setEditBuyer] = useState('')
  const [editQuantity, setEditQuantity] = useState('')
  const [editPrice, setEditPrice] = useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const buyerInputRef = useRef(null)
  const quantityInputRef = useRef(null)
  const priceInputRef = useRef(null)

  const farmers = [
    ...new Map(
      lots.map(lot => [
        lot.seller_id,
        {
          seller_id: lot.seller_id,
          seller_name: lot.seller_name
        }
      ])
    ).values()
  ]

  const farmerLots = lots.filter(
    lot => String(lot.seller_id) === selectedSellerId
  )

  const selectedLot = farmerLots.find(
    lot => String(lot.stock_id) === selectedStockId
  )

  async function loadAuctionData() {
    const [lotData, buyerData, entryData] = await Promise.all([
      apiRequest(`${API}/auction-form/sellers?marketDate=${marketDate}`),
      apiRequest(`${API}/buyers`),
      apiRequest(`${API}/auction-form/entries?marketDate=${marketDate}`)
    ])

    setLots(lotData)
    setBuyers(buyerData)
    setEntries(entryData)
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError('')
        await loadAuctionData()
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [marketDate])

  function handleBuyerKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      quantityInputRef.current?.focus()
    }
  }

  function handleQuantityKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      priceInputRef.current?.focus()
    }
  }

  function handlePriceKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveAuction()
    }
  }

  async function saveAuction() {
    if (loading) return

    setError('')
    setSuccess('')

    if (!selectedSellerId || !selectedStockId) {
      setError('Please select a farmer and delivery lot.')
      return
    }

    if (!buyerName.trim()) {
      setError('Please enter a buyer name.')
      buyerInputRef.current?.focus()
      return
    }

    if (!quantity || Number(quantity) <= 0 ||
        !Number.isInteger(Number(quantity))) {
      setError('Enter a valid whole-number auction quantity.')
      quantityInputRef.current?.focus()
      return
    }

    if (Number(quantity) > Number(selectedLot?.available_qty)) {
      setError('Auction quantity exceeds available stock.')
      quantityInputRef.current?.focus()
      return
    }

    if (price === '' || !Number.isFinite(Number(price)) ||
        Number(price) < 0) {
      setError('Enter a valid price.')
      priceInputRef.current?.focus()
      return
    }

    try {
      setLoading(true)

      await apiRequest(`${API}/auction-form/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_date: marketDate,
          seller_id: Number(selectedSellerId),
          stock_id: Number(selectedStockId),
          buyer_name: buyerName.trim(),
          quantity: Number(quantity),
          price: Number(price)
        })
      })

      setBuyerName('')
      setQuantity('')
      setPrice('')

      await loadAuctionData()
      setSuccess('Auction entry saved successfully.')

      setTimeout(() => {
        buyerInputRef.current?.focus()
      }, 100)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(entry) {
    setEditingId(entry.auction_id)
    setEditBuyer(entry.buyer_name)
    setEditQuantity(String(entry.quantity))
    setEditPrice(String(entry.price))
    setError('')
    setSuccess('')
  }

  async function updateAuction(auctionId) {
    if (loading) return

    setError('')
    setSuccess('')

    if (!editBuyer.trim()) {
      setError('Buyer name is required.')
      return
    }

    if (!editQuantity || Number(editQuantity) <= 0 ||
        !Number.isInteger(Number(editQuantity))) {
      setError('Enter a valid whole-number quantity.')
      return
    }

    if (editPrice === '' || !Number.isFinite(Number(editPrice)) ||
        Number(editPrice) < 0) {
      setError('Enter a valid price.')
      return
    }

    try {
      setLoading(true)

      await apiRequest(`${API}/auction-form/entries/${auctionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer_name: editBuyer.trim(),
          quantity: Number(editQuantity),
          price: Number(editPrice)
        })
      })

      setEditingId(null)
      await loadAuctionData()
      setSuccess('Auction entry updated successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function deleteAuction(auctionId) {
    if (loading) return

    if (!window.confirm('Are you sure you want to delete this auction entry?')) {
      return
    }

    setError('')
    setSuccess('')

    try {
      setLoading(true)

      await apiRequest(`${API}/auction-form/entries/${auctionId}`, {
        method: 'DELETE'
      })

      if (editingId === auctionId) {
        setEditingId(null)
      }

      await loadAuctionData()
      setSuccess('Auction entry deleted successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totalQuantity = entries.reduce(
    (sum, entry) => sum + Number(entry.quantity), 0
  )

  const totalAmount = entries.reduce(
    (sum, entry) => sum + Number(entry.basic_amount), 0
  )

  return (
    <div className="dashboard-content">
      <div className="page-heading">
        <h2>Auction Form</h2>
        <p>Enter and manage daily auction transactions.</p>
      </div>

      <div className="dashboard-panel">
        {error && <div className="alert alert-danger">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Market Date</label>
            <input
              type="date"
              className="form-control"
              value={marketDate}
              onChange={e => {
                setMarketDate(e.target.value)
                setSelectedSellerId('')
                setSelectedStockId('')
                setBuyerName('')
                setQuantity('')
                setPrice('')
              }}
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">Farmer Name</label>
            <select
              className="form-select"
              value={selectedSellerId}
              onChange={e => {
                setSelectedSellerId(e.target.value)
                setSelectedStockId('')
                setQuantity('')
              }}
            >
              <option value="">Select farmer</option>
              {farmers.map(farmer => (
                <option key={farmer.seller_id} value={farmer.seller_id}>
                  {farmer.seller_name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label">Delivery Lot</label>
            <select
              className="form-select"
              value={selectedStockId}
              disabled={!selectedSellerId}
              onChange={e => {
                setSelectedStockId(e.target.value)
                setQuantity('')
              }}
            >
              <option value="">Select delivery lot</option>
              {farmerLots.map(lot => (
                <option key={lot.stock_id} value={lot.stock_id}>
                  {lot.delivery_date} | Available: {lot.available_qty}
                </option>
              ))}
            </select>
          </div>

          {selectedLot && (
            <>
              <div className="col-md-4">
                <label className="form-label">Registered Quantity</label>
                <input className="form-control" value={selectedLot.registered_qty} readOnly />
              </div>
              <div className="col-md-4">
                <label className="form-label">Already Sold</label>
                <input className="form-control" value={selectedLot.sold_qty} readOnly />
              </div>
              <div className="col-md-4">
                <label className="form-label">Available Quantity</label>
                <input className="form-control" value={selectedLot.available_qty} readOnly />
              </div>
            </>
          )}

          <div className="col-md-6">
            <label className="form-label">Buyer Name</label>
            <input
              ref={buyerInputRef}
              className="form-control"
              list="buyer-options"
              value={buyerName}
              onChange={e => setBuyerName(e.target.value)}
              onKeyDown={handleBuyerKeyDown}
              placeholder="Select or type buyer name"
              autoComplete="off"
              disabled={!selectedLot || loading}
            />
            <datalist id="buyer-options">
              {buyers.map(buyer => (
                <option key={buyer.buyer_id} value={buyer.buyer_name} />
              ))}
            </datalist>
          </div>

          <div className="col-md-3">
            <label className="form-label">Auction Quantity</label>
            <input
              ref={quantityInputRef}
              type="number"
              className="form-control"
              min="1"
              max={selectedLot?.available_qty || undefined}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              onKeyDown={handleQuantityKeyDown}
              placeholder="Enter quantity"
              disabled={!selectedLot || selectedLot.available_qty <= 0 || loading}
            />
          </div>

          <div className="col-md-3">
            <label className="form-label">Price per Bunch (₹)</label>
            <input
              ref={priceInputRef}
              type="number"
              className="form-control"
              min="0"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              onKeyDown={handlePriceKeyDown}
              placeholder="Enter price"
              disabled={!selectedLot || loading}
            />
          </div>
        </div>

        <div className="mt-4 d-flex flex-wrap align-items-center gap-3">
          <button
            className="btn btn-primary px-4"
            onClick={saveAuction}
            disabled={loading || !selectedLot || selectedLot.available_qty <= 0}
          >
            {loading ? 'Please wait...' : 'Save Auction'}
          </button>
          <small className="text-muted">
            Keyboard: Buyer Enter → Quantity Enter → Price Enter to Save
          </small>
        </div>
      </div>

      <div className="dashboard-panel mt-4">
        <h5>Saved Auction Entries</h5>

        <div className="row g-3 my-2">
          <div className="col-md-6">
            <div className="summary-card">
              <div>
                <p>Total Sold Quantity</p>
                <h3>{totalQuantity}</h3>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="summary-card">
              <div>
                <p>Total Basic Amount</p>
                <h3>₹{totalAmount.toFixed(2)}</h3>
              </div>
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th>Farmer</th>
                <th>Delivery Date</th>
                <th>Buyer</th>
                <th>Quantity</th>
                <th>Rate</th>
                <th>Basic Amount</th>
                <th>Buyer Total</th>
                <th>Seller Net</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.auction_id}>
                  <td>{entry.seller_name}</td>
                  <td>{entry.delivery_date}</td>
                  <td>
                    {editingId === entry.auction_id ? (
                      <input
                        className="form-control form-control-sm"
                        list="buyer-options"
                        value={editBuyer}
                        onChange={e => setEditBuyer(e.target.value)}
                      />
                    ) : entry.buyer_name}
                  </td>
                  <td>
                    {editingId === entry.auction_id ? (
                      <input
                        type="number"
                        min="1"
                        className="form-control form-control-sm"
                        value={editQuantity}
                        onChange={e => setEditQuantity(e.target.value)}
                      />
                    ) : entry.quantity}
                  </td>
                  <td>
                    {editingId === entry.auction_id ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-control form-control-sm"
                        value={editPrice}
                        onChange={e => setEditPrice(e.target.value)}
                      />
                    ) : `₹${Number(entry.price).toFixed(2)}`}
                  </td>
                  <td>₹{Number(entry.basic_amount).toFixed(2)}</td>
                  <td>₹{Number(entry.grand_total).toFixed(2)}</td>
                  <td>₹{Number(entry.seller_net).toFixed(2)}</td>
                  <td>
                    {editingId === entry.auction_id ? (
                      <>
                        <button
                          className="btn btn-success btn-sm me-1"
                          disabled={loading}
                          onClick={() => updateAuction(entry.auction_id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-outline-primary btn-sm me-1"
                          disabled={loading}
                          onClick={() => startEdit(entry)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-outline-danger btn-sm"
                          disabled={loading}
                          onClick={() => deleteAuction(entry.auction_id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {entries.length === 0 && (
                <tr>
                  <td colSpan="9" className="text-center text-muted py-4">
                    No auction entries found for this market date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default AuctionForm
