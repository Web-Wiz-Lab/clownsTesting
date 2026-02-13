Log from audit_log in GCP Firestore database for an single edit made for a team (bit difficult to copy & paste so format is a bit weird here): 

auditWriteStatus: "ok"
(string)
body:
(map) 
groups:
(array) 
0:
(map) 
atomic: true
(boolean) 
groupId: "Team 25"
(string) 
updates:
(array) 
0:
(map) 
endTime: "14:15"
(string) 
occurrenceId: "4745402267"
(string) 
startTime: "13:30"
(string) 
status: "published"
(string) 
1:
(map) 
endTime: "14:15"
(string) 
occurrenceId: "4745403686"
(string) 
startTime: "13:30"
(string) 
status: "published"
(string)
durationMs: 2162
(int64) 
idempotencyKey: "idem-9550b5d9-ea18-440e-bc88-786b344a26c6"
(string) 
method: "POST"
(string) 
outcome: "success"
(string) 
path: "/api/shifts/bulk"
(string)
payload:
(map) 
counts:
(map) 
failed: 0
(int64) 
success: 1
(int64) 
total: 1
(int64) 
mode: "grouped"
(string) 
requestId: "28779d6c-1c1b-4588-a9a0-4ced6237545f"
(string)
atomic: true
(boolean) 
counts:
(map) 
failed: 0
(int64) 
success: 2
(int64) 
total: 2
(int64) 
groupId: "Team 25"
(string) 
index: 0
(int64) 
results:
(array) 
0:
(map) 
data:
(map) 
date: "2026-08-03"
(string) 
dtend: "2026-08-03T14:15:00-04:00"
(string) 
dtstart: "2026-08-03T13:30:00-04:00"
(string) 
endLabel: "2:15 PM"
(string) 
endTime: "14:15"
(string) 
hasRecurrence: false
(boolean) 
id: "4745402267"
(string) 
locationId: 151378
(int64) 
positionId: 151377
(int64) 
startLabel: "1:30 PM"
(string) 
startTime: "13:30"
(string) 
status: "published"
(string) 
userId: 21341367
(int64) 
index: 0
(int64) 
occurrenceId: "4745402267"
(string) 
status: "success"
(string)
1:
(map) 
data:
(map) 
date: "2026-08-03"
(string) 
dtend: "2026-08-03T14:15:00-04:00"
(string) 
dtstart: "2026-08-03T13:30:00-04:00"
(string) 
endLabel: "2:15 PM"
(string) 
endTime: "14:15"
(string) 
hasRecurrence: false
(boolean) 
id: "4745403686"
(string) 
locationId: 151378
(int64) 
positionId: 151397
(int64) 
startLabel: "1:30 PM"
(string) 
startTime: "13:30"
(string) 
status: "published"
(string) 
userId: 24861296
(int64) 
index: 1
(int64) 
occurrenceId: "4745403686"
(string) 
status: "success"
(string)
rollback:
(map) 
failures:
(array) 
status: "not_needed"
(string) 
rolledBack: false
(boolean) 
status: "success"
(string) 
summary: "ok"
(string) 
timezone: "America/New_York"
(string) 
requestId: "28779d6c-1c1b-4588-a9a0-4ced6237545f"
(string) 
statusCode: 200
(int64) 
timestamp: February 13, 2026 at 1:22:47.568 PM UTC-5
(timestamp)