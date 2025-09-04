Subject: V&V Beta API — Parts endpoint working (commonHeader); Diagrams needs modelNumber examples

Hi Matt and V&V API Team,

Thanks for the guidance and for temporarily disabling Bearer Token. We re-ran tests this morning and here’s what worked and what didn’t.

Environment
- Parts & Orders: `https://soapbeta.streamflow.ca/vandvapi/`
- Diagrams: `https://soapbeta.streamflow.ca/iplvandv/`
- Credentials: user `M1945`, password `9dVxdym69mNs3G8`
- Bearer Token: disabled per your note

1) What worked — Parts & Orders API (GetPartsInfo)
- Key: Using the `commonHeader` payload format resolved auth. Prior failures were from sending `username/password` at the top level.
- Test A — WHP / 80040
  - Time (UTC): 2025-08-22 20:14:08
  - Result: `retCode=200`, `retMsg=Success` with valid stock/pricing
  - Curl used:
    curl -sS -H "Content-Type: application/json" -X POST https://soapbeta.streamflow.ca/vandvapi/GetPartsInfo --data '{"commonHeader":{"user":"M1945","password":"9dVxdym69mNs3G8"},"mfgCode":"WHP","partNumber":"80040"}'

- Test B — WHP / 4392067
  - Time (UTC): 2025-08-22 20:14:17
  - Result: `retCode=200`, `retMsg=Success` with valid stock/pricing
  - Curl used:
    curl -sS -H "Content-Type: application/json" -X POST https://soapbeta.streamflow.ca/vandvapi/GetPartsInfo --data '{"commonHeader":{"user":"M1945","password":"9dVxdym69mNs3G8"},"mfgCode":"WHP","partNumber":"4392067"}'

2) What didn’t — Diagrams API (get-diagrams)
- Using `username/password` at the top level (as previously successful for connectivity) still returns a model mismatch for each model we tried.
- Test C — modelNumber `WRS325SDHZ00`
  - Time (UTC): 2025-08-22 20:14:25
  - Result: 200 OK, body: {"error":"Model Id / Model Number Not Matched"}
  - Curl used:
    curl -sS -H "Content-Type: application/json" -X POST https://soapbeta.streamflow.ca/iplvandv/get-diagrams --data '{"username":"M1945","password":"9dVxdym69mNs3G8","modelNumber":"WRS325SDHZ00"}'

- Test D — modelNumber `WTW5000DW2`
  - Time (UTC): 2025-08-22 20:14:34
  - Result: 200 OK, body: {"error":"Model Id / Model Number Not Matched"}
  - Curl used:
    curl -sS -H "Content-Type: application/json" -X POST https://soapbeta.streamflow.ca/iplvandv/get-diagrams --data '{"username":"M1945","password":"9dVxdym69mNs3G8","modelNumber":"WTW5000DW2"}'

For clearer logging separation, here are our proposed test assignments:
- Matt: `WHP / 341241`
- Us: `WHP / 80040`
- Customer: `WHP / 4392067`

Requests/Questions
1. Diagrams beta data: Could you provide 1–2 modelNumber values known to exist in the beta database so we can validate end-to-end?
2. Normalization: Should we strip dashes/spaces, ignore series suffixes, or apply any manufacturer-specific normalization for `modelNumber`?
3. Search/lookup: If there’s an endpoint to look up models by partial number or by part, please share its path and payload format.
4. Parts API: We will update our backend to always use `commonHeader` for `GetPartsInfo`. Once diagrams are validated, we can add Bearer Token back and re-test.

Appreciate the help—once we have a valid `modelNumber` for beta, we can wire the live diagrams into the app immediately.

Thanks,
Anurag
