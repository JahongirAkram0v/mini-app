import { useEffect, useState } from 'react'

function App() {
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(true) // Dastlab yuklanishni true qilish mumkin
	const [error, setError] = useState(null)
	const [user, setUser] = useState(null) // Telegram foydalanuvchi ma'lumotlari

	// 1-qadam: Telegram foydalanuvchi ma'lumotlarini olish uchun alohida useEffect
	useEffect(() => {
		const tg = window.Telegram.WebApp
		if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
			setUser(tg.initDataUnsafe.user)
		} else {
			// Agar Telegram ma'lumotlari topilmasa, yuklanishni to'xtatib, xatolik ko'rsatish
			setError("Telegram foydalanuvchi ma'lumotlarini olib bo'lmadi.")
			setLoading(false)
		}
	}, []) // Bu faqat bir marta ishlaydi

	// 2-qadam: `user` o'zgaruvchisi yangilanganda backendga so'rov yuborish
	useEffect(() => {
		// Agar `user` mavjud bo'lmasa (hali olinmagan bo'lsa), hech narsa qilmaymiz
		if (!user) {
			return
		}

		// `user` mavjud bo'lgach, yuklanishni boshlaymiz
		setLoading(true)

		// URL manzilida backtick (`) ishlatilganiga e'tibor bering
		fetch(`https://7a6f9b6bc6bc.ngrok-free.app/player/${user.id}`)
			.then(res => {
				if (!res.ok) {
					// Agar javob muvaffaqiyatli bo'lmasa (status 200-299 oralig'ida bo'lmasa)
					// Javobni matn sifatida o'qib, konsolga chiqaramiz
					res.text().then(text => {
						console.error(
							"Serverdan xato javob keldi (HTML bo'lishi mumkin):",
							text
						)
					})
					throw new Error(`Server xatosi: ${res.status}`)
				}
				return res.json() // Faqat `res.ok` bo'lgandagina JSON'ga o'giramiz
			})
			.then(result => {
				setData(result)
			})
			.catch(err => {
				setError(err.message)
			})
			.finally(() => {
				// So'rov muvaffaqiyatli yoki xato bilan tugasa ham yuklanishni to'xtatamiz
				setLoading(false)
			})
	}, [user]) // Bu useEffect `user` o'zgarganda ishga tushadi

	if (loading) return <p>⏳ Yuklanmoqda...</p>
	if (error) return <p style={{ color: 'red' }}>❌ Xatolik: {error}</p>

	return (
		<div style={{ padding: '20px' }}>
			<h1>Backenddan kelgan ma'lumot:</h1>
			{/* `data` mavjud bo'lganda ko'rsatish */}
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
