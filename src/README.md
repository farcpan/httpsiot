# httpsiot

---

## 事前準備

CAルート証明書を事前に取得しておく。

```
$ wget -q https://www.amazontrust.com/repository/AmazonRootCA1.pem
```

---

## トークン取得手順

APIにアクセスしてモノ・証明書・ポリシーを作成、アタッチを実行。レスポンスで証明書と秘密鍵を取得する。
取得した証明書・秘密鍵はファイルに保存しておく。

```
$ curl https://{restapi id}.execute-api.{region}.amazonaws.com/v1/init -X POST -d '{"id":"S0001"}' | jq
```

IoT CoreのCredentialProviderにトークンをリクエストする。`.pem.crt`は証明書、`.pem.key`は秘密鍵を表す。
```
$ curl --cert {.pem.crt} \
--key {.pem.key} \
-H "x-amzn-iot-thingname:{your-thing-name}" \
--cacert {AmazonRootCA1.pem} \
https://{IoTCore Endpoint}/role-aliases/{role alias}/credentials
```

`x-amzn-iot-thingname`ヘッダを設定しない場合、取得したトークンからThingNameを取得することができずIAMポリシーに設定したパラメータ`${credentials-iot:ThingName}`を利用できなくなるため注意すること。

* `IoTCore Endpoint`は以下のコマンドで取得可能
    ```
    $ aws iot describe-endpoint --endpoint-type iot:CredentialProvider --region {region}
    ```
* `{role alias}`には作成したロールエイリアス名を指定する

---

## メモ

* RestAPIの代わりにHttpAPIは利用できない
    * HttpAPIの場合、パスに変数（今回の例ではIoT CoreのThingName）を設定した場合にAPIのARNに変数が含まれないため

---
