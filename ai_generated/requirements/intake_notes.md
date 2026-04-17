# 開発依頼内容

databricksのgenieのような自然言語でどんな情報が欲しいかを問い合わせると、 SQLを自動生成して、グラフを作成するシステムを作りたい。
・バックエンドにはclaudeかcopilotかgeminiを配置したい。
・データ層としてはPostgresかMysqlに接続する
・（オプションか将来）GraphQLでopenapiへの接続も行いたい

## 改修依頼内容

現在は対象をDBとし、コメントを取得してAIがSQLを生成している。
追加の開発として、対象にAPIを入れ、OPENAPIのSPECファイルを取得して、GraphQLを生成して自然言語からデータを収集したい。
