const TOKEN = '8900197244:AAFLfpN3FsDPrXLoGoWcSGesiZiDzMMTcj8'

async function main() {
  // Send a message to yourself first, then check
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`)
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))
  if (data.ok && data.result?.length > 0) {
    const chat = data.result[0].message?.chat
    console.log('\n=== CHAT ID:', chat?.id, '===')
    console.log('Chat type:', chat?.type)
    console.log('Chat title/name:', chat?.title || chat?.first_name || chat?.username)
  } else {
    console.log('\nAucun update trouve. Envoie un message a ton bot sur Telegram puis reessaie.')
  }
}

main().catch(console.error)
