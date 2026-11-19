
import { useEffect, useState } from 'react'

function SellerData() {
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sellerName, setSellerName] = useState('')
  const [sellerMobile, setSellerMobile] = useState('')
  const [sellerVillage, setSellerVillage] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const loadSellers = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await fetch('http://localhost:8080/api/sellers', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? 'Login session not accepted. Please log in again.'
            : 'Unable to load sellers.'
        )
      }

      const data = await response.json()
      setSellers(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSellers()
  }, [])

  const handleAddSeller = async (e) => {
    e.preventDefault()

    if (!sellerName.trim()) {
      setError('Seller name is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('http://localhost:8080/api/sellers', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          seller_name: sellerName.trim(),
          seller_mobile: sellerMobile.trim(),
          village: sellerVillage.trim()
        })
      })

      if (!response.ok) {
        const message = await response.text()
        throw new Error(message || 'Unable to add seller.')
      }

      setSellerName('')
      setSellerMobile('')
      setSellerVillage('')
      setShowForm(false)
      setSuccess('Seller added successfully!')

      await loadSellers()
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
          <h2>Seller Data</h2>
          <p className="text-muted">Manage registered sellers.</p>
        </div>

        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-success"
            onClick={loadSellers}
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
            + Add Seller
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
          <h5 className="mb-3">Register New Seller</h5>

          <form onSubmit={handleAddSeller}>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">Seller Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter seller name"
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  required
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Mobile Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="Enter mobile number"
                  value={sellerMobile}
                  onChange={(e) => setSellerMobile(e.target.value)}
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">Village</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Enter village"
                  value={sellerVillage}
                  onChange={(e) => setSellerVillage(e.target.value)}
                />
              </div>
            </div>

            <div className="d-flex gap-2 mt-4">
              <button
                type="submit"
                className="btn btn-success"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Seller'}
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
          <h5>Registered Sellers</h5>
          <span className="badge bg-success">
            Total: {sellers.length}
          </span>
        </div>

        {loading && <p>Loading sellers...</p>}

        {!loading && !error && (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Seller Name</th>
                  <th>Mobile</th>
                  <th>Village</th>
                  <th>Created Date</th>
                </tr>
              </thead>

              <tbody>
                {sellers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center">
                      No sellers found.
                    </td>
                  </tr>
                ) : (
                  sellers.map((seller) => (
                    <tr key={seller.seller_id}>
                      <td>{seller.seller_id}</td>
                      <td>{seller.seller_name}</td>
                      <td>{seller.seller_mobile || '-'}</td>
                      <td>{seller.village || '-'}</td>
                      <td>{seller.created_at}</td>
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

export default SellerData
