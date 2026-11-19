
import { useEffect, useState } from 'react'

function BuyerData() {
  const [buyers, setBuyers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [buyerName, setBuyerName] = useState('')
  const [buyerMobile, setBuyerMobile] = useState('')
  const [buyerVillage, setBuyerVillage] = useState('')
  const [saving, setSaving] = useState(false)

  const loadBuyers = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch('http://localhost:8080/api/buyers', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Login session not accepted. Please log in again.'
            : 'Unable to load buyers.'
        )
      }

      const data = await response.json()
      setBuyers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBuyers()
  }, [])

  const handleAddBuyer = async (e) => {
    e.preventDefault()

    if (!buyerName.trim()) {
      setError('Buyer name is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('http://localhost:8080/api/buyers', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          buyer_name: buyerName.trim(),
          buyer_mobile: buyerMobile.trim(),
          village: buyerVillage.trim()
        })
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Unable to add buyer.')
      }

      setBuyerName('')
      setBuyerMobile('')
      setBuyerVillage('')
      setShowForm(false)
      setSuccess('Buyer added successfully!')

      await loadBuyers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dashboard-content">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2>Buyer Data</h2>
          <p className="text-muted">Manage registered buyers.</p>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-success"
            onClick={loadBuyers}
            disabled={loading}
          >
            Refresh
          </button>

          <button
            className="btn btn-success"
            onClick={() => {
              setError('')
              setSuccess('')
              setShowForm(true)
            }}
          >
            + Add Buyer
          </button>
        </div>
      </div>

      {success && (
        <div className="alert alert-success">{success}</div>
      )}

      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {showForm && (
        <div className="dashboard-panel mb-4">
          <h5 className="mb-3">Register New Buyer</h5>

          <form onSubmit={handleAddBuyer}>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Buyer Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter buyer name"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Mobile Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="Enter mobile number"
                  value={buyerMobile}
                  onChange={(e) => setBuyerMobile(e.target.value)}
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Village</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter village"
                  value={buyerVillage}
                  onChange={(e) => setBuyerVillage(e.target.value)}
                />
              </div>
            </div>

            <div className="d-flex gap-2 mt-4">
              <button
                type="submit"
                className="btn btn-success"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Buyer'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="dashboard-panel">
        <div className="d-flex justify-content-between mb-3">
          <h5>Registered Buyers</h5>

          <span className="badge bg-success">
            Total: {buyers.length}
          </span>
        </div>

        {loading && <p>Loading buyers...</p>}

        {!loading && !error && (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Buyer Name</th>
                  <th>Mobile</th>
                  <th>Village</th>
                  <th>Created Date</th>
                </tr>
              </thead>

              <tbody>
                {buyers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">
                      No buyers found.
                    </td>
                  </tr>
                ) : (
                  buyers.map((buyer) => (
                    <tr key={buyer.buyer_id}>
                      <td>{buyer.buyer_id}</td>
                      <td>{buyer.buyer_name}</td>
                      <td>{buyer.buyer_mobile || '-'}</td>
                      <td>{buyer.village || '-'}</td>
                      <td>{buyer.created_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default BuyerData
