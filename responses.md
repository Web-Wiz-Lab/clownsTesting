1. Single occurrence only. What happens is: The scheduling coordinator creates an arbitrary shifts for the employees many weeks in advance, this is so they know that they're working that day, the times are not accurate, it's just to make them aware that they are working that day. As the work day approaches, the scheduling coordinator uses this custom program to update the times. So these updates should only update the single instance and leave the other ones alone since those will be changes at a later date.

2. Bulk behavior: partial success

3. timezone rule: The current implementation seems to work, it should be America/New_York. This is of BIG importance as it's really easy for the workflow to go sideways due to incompatible timezones (What the user sets vs what Sling gets).

4. For the UI we will keep the default pastVersions/V4.html

5. GCP:
- Project Number: `89502226654`
- Project ID: `sling-scheduler`
- Region: `us-east1`
Note:
The project was created and billing was enabled for it. No further configuration was done such as creating the cloud run service.

6. Examples:
- Case: Success
Request:
```
[
    {
        "url": "https://api.getsling.com/v1/shifts/4709706576:2026-02-07",
        "method": "put",
        "headers": [
            {
                "name": "Content-Type",
                "value": "application/json"
            },
            {
                "name": "Accept",
                "value": "*/*"
            },
            {
                "name": "Authorization",
                "value": "REPLACE_WITH_SLING_TOKEN"
            }
        ],
        "contentType": "custom",
        "shareCookies": false,
        "parseResponse": true,
        "allowRedirects": true,
        "rawBodyContent": "{\"id\":\"4709706576:2026-02-07\",\"summary\":\"\",\"status\":\"published\",\"type\":\"shift\",\"fullDay\":false,\"openEnd\":true,\"dtstart\":\"2026-02-07T12:45:00-05:00\",\"dtend\":\"2026-02-07T17:00:00-05:00\",\"approved\":null,\"assigneeNotes\":\"\",\"fromIntegration\":null,\"rrule\":{\"id\":4709706576,\"from\":\"2026-02-07T09:15:00-05:00\",\"until\":\"2026-03-07T23:59:00-05:00\",\"interval\":1,\"byday\":\"SA\",\"freq\":\"WEEKLY\"},\"user\":{\"id\":7878740},\"location\":{\"id\":151378},\"position\":{\"id\":151397},\"breakDuration\":0,\"available\":false,\"slots\":1,\"acceptance\":\"accepted\",\"acceptanceReason\":\"\",\"tags\":[],\"taskTemplates\":[]}",
        "stopOnHttpError": true,
        "contentTypeValue": "application/json",
        "requestCompressedContent": true
    }
]
```
Response:
```
[
    {
        "data": [
            {
                "id": "4709706576:2026-02-07",
                "summary": "",
                "status": "published",
                "type": "shift",
                "fullDay": false,
                "openEnd": true,
                "dtstart": "2026-02-07T12:45:00-05:00",
                "dtend": "2026-02-07T17:00:00-05:00",
                "approved": null,
                "assigneeNotes": "",
                "fromIntegration": null,
                "user": {
                    "id": 7878740
                },
                "location": {
                    "id": 151378
                },
                "position": {
                    "id": 151397
                },
                "breakDuration": 0,
                "available": false,
                "slots": 1,
                "acceptance": null,
                "acceptanceReason": null,
                "tags": [],
                "taskTemplates": []
            }
        ],
        "headers": {
            "date": "Fri, 06 Feb 2026 13:51:31 GMT",
            "content-type": "application/json",
            "content-length": "285",
            "connection": "keep-alive",
            "cf-ray": "9c9b1f6ed99a0628-IAD",
            "cache-control": "no-cache, no-store",
            "vary": "Accept-Encoding",
            "cf-cache-status": "DYNAMIC",
            "set-cookie": [
                "__cf_bm=uNBp3ayAl8_jjdXmRO8fc8ZlekcqIPiBZ1A3vLktlYM-1770385891-1.0.1.1-l0NBUwS7fXfOcT2p5hNBNr1nBWTwWcCGf5wAzw2zHgE0RZEmSCLCmUX0M3G6jU6RxjNI_p1XVF9CTLlOGH0MRYsewNp4hHRwNnU8haapG7Y; path=/; expires=Fri, 06-Feb-26 14:21:31 GMT; domain=.api.getsling.com; HttpOnly; Secure; SameSite=None"
            ],
            "server": "cloudflare"
        },
        "statusCode": 200
    }
]
```

