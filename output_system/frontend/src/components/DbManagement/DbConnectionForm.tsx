/**
 * DbConnectionForm コンポーネント
 *
 * DB接続先の登録・編集フォーム。
 * 新規登録時は空のフォームを表示し、編集時は既存値を初期値として表示する。
 *
 * 機能:
 * - 接続名・DB種別・ホスト・ポート・ユーザー名・パスワード・DB名の入力（MySQL/PostgreSQL時）
 * - 接続名・DB種別・エンドポイントURLの入力（GraphQL時）
 * - DB種別で「GraphQL」選択時: ホスト/ポート/ユーザー/パスワード/DB名フィールドを非表示
 * - DB種別で「GraphQL」選択時: エンドポイントURL入力フィールドを表示
 * - フォームバリデーション（必須フィールドチェック・ポート番号範囲チェック・URL形式チェック）
 * - 「接続テスト」ボタン: 入力値でバックエンドに接続を試行し、結果をToastで表示
 * - 「保存」ボタン: バリデーション通過後に onSave を呼び出す
 * - 「キャンセル」ボタン: 変更を破棄して onCancel を呼び出す
 *
 * 設計方針:
 * - 制御されたコンポーネント（controlled component）でフォーム状態を管理
 * - バリデーションエラーはフィールド単位で表示
 * - 接続テスト中・保存中はボタンを無効化してUI操作を防ぐ
 * - DB種別が変わると必要なフィールドだけを表示する（条件付きレンダリング）
 *
 * 参考: screens.md DB管理モーダル ワイヤーフレーム
 *
 * PBI #148 追加
 * PBI #200 改修: GraphQLフォーム切替対応
 */

import { useState, useCallback, useEffect, type FC, type FormEvent, type ChangeEvent } from 'react'
import type { DbConnection, DbConnectionInput, DbType } from '../../types'

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/**
 * DbConnectionForm の Props
 *
 * @property connection    - 編集対象の接続先（null = 新規登録モード）
 * @property isSaving      - 保存中かどうか（外部から制御）
 * @property onSave        - 保存ボタン押下時のコールバック（バリデーション済みの入力値を渡す）
 * @property onCancel      - キャンセルボタン押下時のコールバック
 * @property onTestConnection - 接続テスト実行コールバック（Toast表示を含む）
 */
interface DbConnectionFormProps {
  connection: DbConnection | null
  isSaving: boolean
  onSave: (input: DbConnectionInput) => Promise<void>
  onCancel: () => void
  onTestConnection: (input: DbConnectionInput) => Promise<void>
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * DB種別ごとのデフォルトポート番号
 * graphql はポートを使用しないためundefined
 */
const DEFAULT_PORTS: Partial<Record<DbType, number>> = {
  mysql: 3306,
  postgresql: 5432,
}

/**
 * フォームの初期値（新規登録時）
 */
const INITIAL_FORM_VALUES: DbConnectionInput = {
  name: '',
  dbType: 'mysql',
  host: '',
  port: DEFAULT_PORTS.mysql,
  username: '',
  password: '',
  databaseName: '',
  endpointUrl: '',
}

// ---------------------------------------------------------------------------
// バリデーション
// ---------------------------------------------------------------------------

/**
 * フォームバリデーションエラーの型
 * 各フィールドのエラーメッセージを保持する（エラーなしは空文字）。
 *
 * PBI #200: endpointUrl フィールドのエラーを追加
 */
interface FormErrors {
  name: string
  host: string
  port: string
  username: string
  password: string
  databaseName: string
  /** GraphQL接続時のエンドポイントURLエラー */
  endpointUrl: string
}

/**
 * フォームの入力値をバリデーションする
 *
 * DB種別によってバリデーションルールを切り替える:
 * - GraphQL: endpointUrl が必須（URL形式チェック）
 * - MySQL/PostgreSQL: host/port/username/databaseName が必須
 *
 * @param values - バリデーション対象のフォーム値
 * @param isEdit - 編集モードかどうか（DB接続の編集時はパスワード空許容）
 * @returns バリデーションエラー（全フィールドエラーなしなら全て空文字）
 */
function validateForm(values: DbConnectionInput, isEdit: boolean): FormErrors {
  const errors: FormErrors = {
    name: '',
    host: '',
    port: '',
    username: '',
    password: '',
    databaseName: '',
    endpointUrl: '',
  }

  // 接続名: 必須・最大100文字（全種別共通）
  if (!values.name.trim()) {
    errors.name = '接続名は必須です'
  } else if (values.name.trim().length > 100) {
    errors.name = '接続名は100文字以内で入力してください'
  }

  if (values.dbType === 'graphql') {
    // GraphQL接続のバリデーション: endpointUrl が必須・URL形式チェック
    if (!values.endpointUrl?.trim()) {
      errors.endpointUrl = 'エンドポイントURLは必須です'
    } else {
      try {
        const url = new URL(values.endpointUrl.trim())
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          errors.endpointUrl = 'エンドポイントURLは http:// または https:// で始まる必要があります'
        }
      } catch {
        errors.endpointUrl = '有効なURL形式で入力してください（例: https://api.example.com/graphql）'
      }
    }
  } else {
    // DB接続（MySQL/PostgreSQL）のバリデーション: 従来通り
    // ホスト名: 必須
    if (!values.host?.trim()) {
      errors.host = 'ホスト名は必須です'
    }

    // ポート番号: 必須・1〜65535の範囲
    const portNum = Number(values.port)
    if (!values.port && values.port !== 0) {
      errors.port = 'ポート番号は必須です'
    } else if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.port = 'ポート番号は1〜65535の整数を入力してください'
    }

    // ユーザー名: 必須
    if (!values.username?.trim()) {
      errors.username = 'ユーザー名は必須です'
    }

    // パスワード: 新規登録時は必須。編集時は空を許容（空の場合は変更なし）
    if (!isEdit && !values.password) {
      errors.password = 'パスワードは必須です'
    }

    // DB名: 必須
    if (!values.databaseName?.trim()) {
      errors.databaseName = 'データベース名は必須です'
    }
  }

  return errors
}

/**
 * バリデーションエラーが存在するかチェックする
 *
 * @param errors - FormErrors オブジェクト
 * @returns エラーが1つ以上ある場合は true
 */
function hasErrors(errors: FormErrors): boolean {
  return Object.values(errors).some((msg) => msg !== '')
}

// ---------------------------------------------------------------------------
// DbConnectionForm コンポーネント
// ---------------------------------------------------------------------------

/**
 * DB接続先登録・編集フォームコンポーネント
 *
 * DB種別ドロップダウンで「GraphQL」を選択すると、ホスト/ポート/ユーザー等の
 * フィールドが非表示になり、エンドポイントURL入力フィールドが表示される。
 *
 * @param props - DbConnectionFormProps
 */
const DbConnectionForm: FC<DbConnectionFormProps> = ({
  connection,
  isSaving,
  onSave,
  onCancel,
  onTestConnection,
}) => {
  // 編集モードかどうか（connection が null でない場合は編集モード）
  const isEdit = connection !== null

  // フォームの入力値（制御されたコンポーネント）
  const [values, setValues] = useState<DbConnectionInput>(() => {
    if (connection) {
      // 編集モード: 既存値を初期値として設定（パスワードは空にする）
      if (connection.dbType === 'graphql') {
        // GraphQL接続先の編集
        return {
          name: connection.name,
          dbType: 'graphql',
          endpointUrl: connection.endpointUrl ?? '',
        }
      }
      // DB接続先（MySQL/PostgreSQL）の編集
      return {
        name: connection.name,
        dbType: connection.dbType,
        host: connection.host ?? '',
        port: connection.port ?? DEFAULT_PORTS[connection.dbType] ?? 3306,
        username: connection.username ?? '',
        password: '', // セキュリティ上、既存パスワードは表示しない
        databaseName: connection.databaseName ?? '',
        endpointUrl: '',
      }
    }
    // 新規登録モード: 空の初期値
    return { ...INITIAL_FORM_VALUES }
  })

  // バリデーションエラー（送信試行後にのみ表示）
  const [errors, setErrors] = useState<FormErrors>({
    name: '',
    host: '',
    port: '',
    username: '',
    password: '',
    databaseName: '',
    endpointUrl: '',
  })

  // 送信が試みられたかどうか（初回送信前はエラー非表示）
  const [submitted, setSubmitted] = useState(false)

  // 接続テスト中かどうか
  const [isTesting, setIsTesting] = useState(false)

  /**
   * GraphQL接続かどうかの判定（フィールド表示切替に使用）
   */
  const isGraphQL = values.dbType === 'graphql'

  /**
   * connection が変わった場合（別のエントリの編集に切り替え）はフォームをリセット
   */
  useEffect(() => {
    if (connection) {
      if (connection.dbType === 'graphql') {
        setValues({
          name: connection.name,
          dbType: 'graphql',
          endpointUrl: connection.endpointUrl ?? '',
        })
      } else {
        setValues({
          name: connection.name,
          dbType: connection.dbType,
          host: connection.host ?? '',
          port: connection.port ?? DEFAULT_PORTS[connection.dbType] ?? 3306,
          username: connection.username ?? '',
          password: '', // セキュリティ上、既存パスワードは表示しない
          databaseName: connection.databaseName ?? '',
          endpointUrl: '',
        })
      }
    } else {
      setValues({ ...INITIAL_FORM_VALUES })
    }
    // フォームリセット時はエラーと送信フラグもクリア
    setErrors({ name: '', host: '', port: '', username: '', password: '', databaseName: '', endpointUrl: '' })
    setSubmitted(false)
  }, [connection])

  /**
   * テキスト・セレクト入力の変更ハンドラ（汎用）
   *
   * DB種別が変更された場合はデフォルトポートも自動更新する。
   * GraphQL に切り替えた場合は DB固有フィールドをクリアし、
   * DB（MySQL/PostgreSQL）に切り替えた場合は endpointUrl をクリアする。
   *
   * @param e - 変更イベント
   */
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target

      setValues((prev) => {
        const next = { ...prev, [name]: value }
        // DB種別が変わったらデフォルトポートを自動設定 and フィールドをリセット
        if (name === 'dbType') {
          if (value === 'graphql') {
            // GraphQL選択時: DB固有フィールドをクリア
            next.host = ''
            next.port = undefined
            next.username = ''
            next.password = ''
            next.databaseName = ''
            next.endpointUrl = next.endpointUrl ?? ''
          } else {
            // DB選択時: GraphQL固有フィールドをクリアし、デフォルトポートを設定
            next.endpointUrl = ''
            next.port = DEFAULT_PORTS[value as DbType] ?? 3306
          }
        }
        return next
      })

      // 送信後にフィールドが変更された場合はリアルタイムバリデーション
      if (submitted) {
        setErrors((prev) => {
          const updatedValues = { ...values, [name]: value }
          const newErrors = validateForm(updatedValues, isEdit)
          return { ...prev, [name]: newErrors[name as keyof FormErrors] }
        })
      }
    },
    [submitted, values, isEdit],
  )

  /**
   * 接続テストボタンのハンドラ
   *
   * フォームの現在の入力値でバックエンドに接続テストを依頼する。
   * 結果は呼び出し元（onTestConnection）でToastに表示される。
   */
  const handleTest = useCallback(async () => {
    setIsTesting(true)
    try {
      await onTestConnection(values)
    } finally {
      setIsTesting(false)
    }
  }, [values, onTestConnection])

  /**
   * フォーム送信ハンドラ（保存ボタン）
   *
   * バリデーションを実行し、全条件を満たした場合のみ onSave を呼び出す。
   *
   * @param e - フォーム送信イベント
   */
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setSubmitted(true)

      const validationErrors = validateForm(values, isEdit)
      setErrors(validationErrors)

      if (hasErrors(validationErrors)) {
        // バリデーションエラーがある場合は送信しない
        return
      }

      await onSave(values)
    },
    [values, isEdit, onSave],
  )

  // ボタンの無効状態（保存中 or テスト中）
  const isDisabled = isSaving || isTesting

  return (
    <form className="db-connection-form" onSubmit={handleSubmit} noValidate>
      {/* フォームタイトル */}
      <h3 className="db-connection-form__title">
        {isEdit ? '接続先を編集' : '新しい接続先を追加'}
      </h3>

      {/* 接続名（全種別共通） */}
      <div className="form-field">
        <label htmlFor="conn-name" className="form-field__label">
          接続名 <span className="form-field__required" aria-label="必須">*</span>
        </label>
        <input
          id="conn-name"
          type="text"
          name="name"
          className={`form-field__input${errors.name && submitted ? ' form-field__input--error' : ''}`}
          value={values.name}
          onChange={handleChange}
          placeholder="例: 本番DB"
          disabled={isDisabled}
          aria-describedby={errors.name && submitted ? 'conn-name-error' : undefined}
          aria-required="true"
          maxLength={100}
        />
        {errors.name && submitted && (
          <p id="conn-name-error" className="form-field__error" role="alert">
            {errors.name}
          </p>
        )}
      </div>

      {/* DB種別（全種別共通） */}
      <div className="form-field">
        <label htmlFor="conn-db-type" className="form-field__label">
          DB種別 <span className="form-field__required" aria-label="必須">*</span>
        </label>
        <select
          id="conn-db-type"
          name="dbType"
          className="form-field__select"
          value={values.dbType}
          onChange={handleChange}
          disabled={isDisabled}
          aria-required="true"
        >
          <option value="mysql">MySQL</option>
          <option value="postgresql">PostgreSQL</option>
          {/* PBI #200: GraphQL接続先オプションを追加 */}
          <option value="graphql">GraphQL</option>
        </select>
      </div>

      {/*
       * GraphQL接続時のフィールド（PBI #200 追加）
       *
       * DB種別が「GraphQL」の場合のみ表示する。
       * ホスト/ポート/ユーザー/パスワード/DB名フィールドは非表示になる。
       */}
      {isGraphQL && (
        <div className="form-field">
          <label htmlFor="conn-endpoint-url" className="form-field__label">
            エンドポイントURL <span className="form-field__required" aria-label="必須">*</span>
          </label>
          <input
            id="conn-endpoint-url"
            type="url"
            name="endpointUrl"
            className={`form-field__input${errors.endpointUrl && submitted ? ' form-field__input--error' : ''}`}
            value={values.endpointUrl ?? ''}
            onChange={handleChange}
            placeholder="例: https://api.example.com/graphql"
            disabled={isDisabled}
            aria-describedby={errors.endpointUrl && submitted ? 'conn-endpoint-url-error' : undefined}
            aria-required="true"
          />
          {errors.endpointUrl && submitted && (
            <p id="conn-endpoint-url-error" className="form-field__error" role="alert">
              {errors.endpointUrl}
            </p>
          )}
          {/* GraphQL接続のヒント */}
          <p className="form-field__hint">
            GraphQL APIのエンドポイントURLを入力してください。接続テストでIntrospection Queryが実行されます。
          </p>
        </div>
      )}

      {/*
       * DB接続（MySQL/PostgreSQL）時のフィールド
       *
       * DB種別が「MySQL」または「PostgreSQL」の場合のみ表示する。
       * GraphQL選択時はこのブロック全体が非表示になる。
       */}
      {!isGraphQL && (
        <>
          {/* ホスト名 */}
          <div className="form-field">
            <label htmlFor="conn-host" className="form-field__label">
              ホスト名 <span className="form-field__required" aria-label="必須">*</span>
            </label>
            <input
              id="conn-host"
              type="text"
              name="host"
              className={`form-field__input${errors.host && submitted ? ' form-field__input--error' : ''}`}
              value={values.host ?? ''}
              onChange={handleChange}
              placeholder="例: db-server または 192.168.1.1"
              disabled={isDisabled}
              aria-describedby={errors.host && submitted ? 'conn-host-error' : undefined}
              aria-required="true"
            />
            {errors.host && submitted && (
              <p id="conn-host-error" className="form-field__error" role="alert">
                {errors.host}
              </p>
            )}
          </div>

          {/* ポート番号 */}
          <div className="form-field">
            <label htmlFor="conn-port" className="form-field__label">
              ポート番号 <span className="form-field__required" aria-label="必須">*</span>
            </label>
            <input
              id="conn-port"
              type="number"
              name="port"
              className={`form-field__input form-field__input--port${errors.port && submitted ? ' form-field__input--error' : ''}`}
              value={values.port ?? ''}
              onChange={handleChange}
              min={1}
              max={65535}
              disabled={isDisabled}
              aria-describedby={errors.port && submitted ? 'conn-port-error' : undefined}
              aria-required="true"
            />
            {errors.port && submitted && (
              <p id="conn-port-error" className="form-field__error" role="alert">
                {errors.port}
              </p>
            )}
          </div>

          {/* ユーザー名 */}
          <div className="form-field">
            <label htmlFor="conn-username" className="form-field__label">
              ユーザー名 <span className="form-field__required" aria-label="必須">*</span>
            </label>
            <input
              id="conn-username"
              type="text"
              name="username"
              className={`form-field__input${errors.username && submitted ? ' form-field__input--error' : ''}`}
              value={values.username ?? ''}
              onChange={handleChange}
              placeholder="例: readonly_user"
              disabled={isDisabled}
              aria-describedby={errors.username && submitted ? 'conn-username-error' : undefined}
              aria-required="true"
              autoComplete="username"
            />
            {errors.username && submitted && (
              <p id="conn-username-error" className="form-field__error" role="alert">
                {errors.username}
              </p>
            )}
          </div>

          {/* パスワード */}
          <div className="form-field">
            <label htmlFor="conn-password" className="form-field__label">
              パスワード
              {!isEdit && (
                <span className="form-field__required" aria-label="必須">*</span>
              )}
              {isEdit && (
                <span className="form-field__hint">（空の場合は変更しない）</span>
              )}
            </label>
            <input
              id="conn-password"
              type="password"
              name="password"
              className={`form-field__input${errors.password && submitted ? ' form-field__input--error' : ''}`}
              value={values.password ?? ''}
              onChange={handleChange}
              placeholder={isEdit ? '変更する場合のみ入力' : 'パスワードを入力'}
              disabled={isDisabled}
              aria-describedby={errors.password && submitted ? 'conn-password-error' : undefined}
              aria-required={!isEdit}
              autoComplete={isEdit ? 'current-password' : 'new-password'}
            />
            {errors.password && submitted && (
              <p id="conn-password-error" className="form-field__error" role="alert">
                {errors.password}
              </p>
            )}
          </div>

          {/* データベース名 */}
          <div className="form-field">
            <label htmlFor="conn-db-name" className="form-field__label">
              データベース名 <span className="form-field__required" aria-label="必須">*</span>
            </label>
            <input
              id="conn-db-name"
              type="text"
              name="databaseName"
              className={`form-field__input${errors.databaseName && submitted ? ' form-field__input--error' : ''}`}
              value={values.databaseName ?? ''}
              onChange={handleChange}
              placeholder="例: sampledb"
              disabled={isDisabled}
              aria-describedby={errors.databaseName && submitted ? 'conn-db-name-error' : undefined}
              aria-required="true"
            />
            {errors.databaseName && submitted && (
              <p id="conn-db-name-error" className="form-field__error" role="alert">
                {errors.databaseName}
              </p>
            )}
          </div>
        </>
      )}

      {/* アクションボタン */}
      <div className="db-connection-form__actions">
        {/* 接続テストボタン */}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => void handleTest()}
          disabled={isDisabled}
          aria-busy={isTesting}
        >
          {isTesting ? '接続テスト中...' : '接続テスト'}
        </button>

        <div className="db-connection-form__actions-right">
          {/* キャンセルボタン */}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={isDisabled}
          >
            キャンセル
          </button>

          {/* 保存ボタン */}
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isDisabled}
            aria-busy={isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </form>
  )
}

export default DbConnectionForm
