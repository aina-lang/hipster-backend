const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");

const apiId = 32864624;
const apiHash = "7d8c05d23b32de6deee14ae008ed3b25";
const stringSession = new StringSession(""); // On commence à vide

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

(async () => {
  console.log("Loading interactive session generator...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () =>
      new Promise((resolve) =>
        rl.question("S'il te plaît, entre ton numéro de téléphone (au format +33...): ", resolve)
      ),
    password: async () =>
      new Promise((resolve) =>
        rl.question("Entre ton mot de passe (si 2FA activé): ", resolve)
      ),
    phoneCode: async () =>
      new Promise((resolve) =>
        rl.question("Entre le code de vérification SMS/Telegram: ", resolve)
      ),
    onError: (err) => console.log(err),
  });

  console.log("--- CONNEXION RÉUSSIE ---");
  console.log("Voici ta STRING_SESSION (COPIE-LA BIEN !) :");
  console.log(client.session.save()); // C'est CA qu'il nous faudra mettre dans le serveur
  process.exit();
})();
