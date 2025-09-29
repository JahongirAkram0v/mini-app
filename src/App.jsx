import axios from 'axios' // axios'ni o'rnatishni unutmang: npm install axios
import { useEffect, useState } from 'react'

function App() {
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [user, setUser] = useState(null)

	// 1-qadam: Telegram foydalanuvchi ma'lumotlarini olish
	useEffect(() => {
		try {
			const tg = window.Telegram.WebApp
			if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
				setUser(tg.initDataUnsafe.user)
			} else {
				throw new Error("Telegram foydalanuvchi ma'lumotlarini olib bo'lmadi.")
			}
		} catch (e) {
			setError(e.message)
			setLoading(false) // Xatolik bo'lsa yuklanishni to'xtatamiz
		}
	}, [])

	// 2-qadam: `user` olingach, backendga so'rov yuborish
	useEffect(() => {
		if (!user) {
			// Agar user hali olinmagan bo'lsa (yoki telegramdan olib bo'lmagan bo'lsa),
			// yuklanishni to'xtatib turamiz.
			if (!error) setLoading(false)
			return
		}

		const fetchPlayerData = async () => {
			setLoading(true)
			setError(null) // Yangi so'rovdan oldin eski xatolikni tozalash
			try {
				// .env faylidan olingan manzil
				const response = await axios.get(
					`${import.meta.env.REACT_APP_API_URL}/player/${user.id}`
				)
				setData(response.data)
			} catch (err) {
				let errorMessage = "Noma'lum xatolik yuz berdi."
				if (err.response) {
					errorMessage = `Server xatosi (${
						err.response.status
					}): ${JSON.stringify(err.response.data)}`
				} else if (err.request) {
					errorMessage =
						"Serverga ulanib bo'lmadi. Internet aloqasini tekshiring."
				} else {
					errorMessage = err.message
				}
				setError(errorMessage)
			} finally {
				setLoading(false)
			}
		}

		fetchPlayerData()
	}, [user, error]) // `user` o'zgarganda bu effekt ishga tushadi

	// Render qismi o'zgarishsiz qoladi...
	if (loading) return <p>⏳ Yuklanmoqda...</p>
	if (error) return <p style={{ color: 'red' }}>❌ Xatolik: {error}</p>

	return (
		<div style={{ padding: '20px', wordBreak: 'break-all' }}>
			<h1>Backenddan kelgan ma'lumot:</h1>
			{data ? (
				<pre>{JSON.stringify(data, null, 2)}</pre>
			) : (
				<p>Ma'lumot topilmadi.</p>
			)}

			{user && (
				<div style={{ marginTop: '20px' }}>
					<h2>Telegram foydalanuvchisi:</h2>
					<p>
						<b>ID:</b> {user.id}
					</p>
					<p>
						<b>Ism:</b> {user.first_name} {user.last_name || ''}
					</p>
					<p>
						<b>Username:</b> @{user.username}
					</p>
				</div>
			)}
		</div>
	)
}

export default App
