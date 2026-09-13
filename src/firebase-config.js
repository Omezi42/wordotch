// Firebaseプロジェクトの設定をここに入力してください。
// Firebaseコンソール(https://console.firebase.google.com/)で
// プロジェクトを作成 → 「Realtime Database」を有効化 → ウェブアプリを追加 すると
// 下記の形式の設定オブジェクトが発行されます。それをそのまま貼り付けてください。
//
// このapiKey等はサーバーの秘密鍵ではなく、公開されても問題ない「公開識別子」です。
// アクセス制御はFirebaseの「セキュリティルール」側で行うため、このファイルはそのまま
// GitHubにコミットして問題ありません（詳細はREADME.mdを参照）。

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
