import { useEffect, useState } from 'react'

function App() {
	const [data, setData] = useState(null) // backenddan kelgan ma'lumot
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [user, setUser] = useState(null) // Telegram foydalanuvchi ma'lumotlari

	useEffect(() => {
		// Telegram user ma'lumotlarini olish
		const tg = window.Telegram.WebApp
		if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
			setUser(tg.initDataUnsafe.user)
		}

		// Backenddan ma'lumot olish
		fetch('https://6f48c76447e9.ngrok-free.app/player/${user.id}')
			.then(res => {
				if (!res.ok) {
					throw new Error('Serverdan noto‘g‘ri javob keldi')
				}
				return res.json()
			})
			.then(result => {
				setData(result)
				setLoading(false)
			})
			.catch(err => {
				setError(err.message)
				setLoading(false)
			})
	}, [])

	if (loading) return <p>⏳ Yuklanmoqda...</p>
	if (error) return <p style={{ color: 'red' }}>❌ Xatolik: {error}</p>

	return (
		<div style={{ padding: '20px' }}>
			<h1>Backenddan kelgan ma'lumot:</h1>
			<pre>{JSON.stringify(data, null, 2)}</pre>

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
