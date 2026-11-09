# Rapid Response EMS

An emergency ambulance request, dispatch, and tracking system for a DevOps & Full Stack course project. The app combines a Node.js/Express API, MongoDB persistence, and a responsive browser dashboard for dispatchers, administrators, ambulance drivers, and requesters.

> **Demo note:** The included city map and sample locations are illustrative. This project is a classroom demo, not a medical dispatch service. Do not use it to contact emergency services or make real-world care decisions.

## Features

- Role-aware sign-in for **Admin**, **Dispatcher**, **Ambulance Driver**, and **Requester**.
- Create emergency requests with caller/patient contact details, incident type and priority, pickup address, coordinates, and notes.
- Assign an available ambulance and driver; vehicle assignment is conditionally updated to prevent two dispatchers from taking the same available unit.
- Follow the request workflow: **Pending → Dispatched → En route to pickup → On scene → Picked up → Transporting → Completed**. Terminal requests cannot be reopened.
- Review a simulated city map, fleet availability, active incidents, and estimated response time.
- Four operational reports: **Emergency Request**, **Ambulance Utilization**, **Response Time**, and **Driver Activity**.
- API role checks, password hashing, signed HTTP-only session cookie, login rate limiting, health check, and input validation.
- Docker Compose, Kubernetes manifests, and a GitHub Actions test/build workflow.

## Screens

The dashboard has nine views (eight required):

1. **Overview** — active-call and fleet metrics, response overview, recent activity.
2. **Emergency requests** — searchable, filterable incident queue and status actions.
3. **New request** — caller, patient, emergency, and pickup location form.
4. **Dispatch board** — prioritized queue and ambulance/driver assignment.
5. **Live tracking** — illustrative map, vehicles, and incident locations.
6. **Ambulance fleet** — units, stations, assigned crew, and availability.
7. **Driver activity** — driver roster and call history summaries.
8. **Reports** — all four required reports, date filters, and response-time detail.
9. **Team & access** — admin-only account roster and role permissions.

## Technology and architecture

- **Frontend:** HTML, CSS, vanilla JavaScript; served by Express.
- **Backend:** Node.js 22+, Express 4, Mongoose 8.
- **Database:** MongoDB 7.
- **Deployment:** Docker / Docker Compose; Kubernetes Deployment, Service, ConfigMap, Secret, and MongoDB StatefulSet.

The `users` collection stores role and login identity; `ambulances` stores unit availability and current location; `emergencyrequests` stores incident details plus a bounded status-timeline subdocument. Driver and vehicle relationships are references because those records are independently queried and updated. Requester contact details and request lifecycle events are embedded because they are read with each incident.

```text
Browser ── HTTP-only session cookie ──> Express API / static frontend
                                           │
                                           └── Mongoose ──> MongoDB
```

### Main API routes

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Sign in |
| GET | `/api/auth/me` | Signed in | Current user |
| POST | `/api/auth/logout` | Signed in | End the session |
| GET / POST | `/api/requests` | Signed in / requester, dispatcher, admin | List visible requests / create a request |
| PATCH | `/api/requests/:id/dispatch` | Dispatcher, admin | Assign an available ambulance and driver |
| PATCH | `/api/requests/:id/status` | Assigned driver, dispatcher, admin | Advance an incident status |
| GET | `/api/fleet` | Signed in | List fleet and active drivers |
| PATCH | `/api/fleet/:id/location` | Assigned driver, dispatcher, admin | Update vehicle coordinates |
| GET | `/api/reports/requests` | Dispatcher, admin | Emergency request report |
| GET | `/api/reports/utilization` | Dispatcher, admin | Ambulance utilization report |
| GET | `/api/reports/response-times` | Dispatcher, admin | Response-time report |
| GET | `/api/reports/driver-activity` | Dispatcher, admin | Driver activity report |
| GET | `/api/health` | Public | App/database readiness |

## Run locally

Requirements: Node.js 22+ and MongoDB 7 running locally.

```powershell
cd C:\path\to\ambulance-response-system
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `MONGODB_URI` and a private `JWT_SECRET` of at least 24 characters. Seed the demo accounts and sample calls, then start the app:

```powershell
npm run seed
npm start
```

Open [http://localhost:3000](http://localhost:3000). For development with automatic Node server restarts, use `npm run dev`. The seed script is safe to run again: it upserts demo users and inserts the initial fleet/calls only if they do not already exist. Demo passwords are reset to the values below when reseeded.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@rapidresponse.local` | `Admin123!` |
| Dispatcher | `dispatch@rapidresponse.local` | `Dispatch123!` |
| Driver | `driver@rapidresponse.local` | `Driver123!` |
| Driver | `driver2@rapidresponse.local` | `Driver123!` |
| Requester | `requester@rapidresponse.local` | `Request123!` |

These are local demo credentials only. Do not use them in a deployed environment.

## Tests

```powershell
npm test
```

The test suite covers valid incident status progression and rejection of invalid or terminal transitions.

## Docker

Docker Compose starts the app and MongoDB with a persistent database volume:

```powershell
docker compose up --build -d
docker compose exec app npm run seed
```

Open [http://localhost:3000](http://localhost:3000). Check the API/database readiness at `/api/health`. Stop the services with `docker compose down`; persisted MongoDB data remains in the `mongo-data` volume. Use `docker compose down -v` only if you intentionally want to delete that data.

## Kubernetes (local cluster)

The sample is intended for a local learning cluster (for example, Minikube) and uses a single MongoDB replica with a PVC. A production deployment should use a managed MongoDB service or a secured database operator, TLS ingress, and managed secrets.

1. Start a Kubernetes cluster and build/load the image:

   ```powershell
   docker build -t rapid-response-ems:1.0.0 .
   minikube image load rapid-response-ems:1.0.0
   ```

2. Create a private JWT secret (do not commit the generated `secret.yaml`):

   ```powershell
   Copy-Item k8s\secret.example.yaml k8s\secret.yaml
   # Edit JWT_SECRET in k8s\secret.yaml to a private random value.
   kubectl apply -f k8s\secret.yaml
   ```

3. Deploy MongoDB and the app:

   ```powershell
   kubectl apply -f k8s\mongo.yaml
   kubectl apply -f k8s\app.yaml
   kubectl rollout status statefulset/mongo
   kubectl rollout status deployment/rapid-response
   kubectl exec deployment/rapid-response -- npm run seed
   ```

4. Open the NodePort at `http://<cluster-ip>:30080` (for Minikube, run `minikube service rapid-response --url`). Confirm `/api/health` returns `200` and `{"status":"ok","database":"connected"}`.

## GitHub and version control

The included `.github/workflows/ci.yml` runs `npm ci`, the test suite, and a Docker image build for pushes to `main` and pull requests. To publish from this folder, create an empty GitHub repository, then:

```powershell
git init
git add .
git commit -m "Build Rapid Response EMS application"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```

Commit incremental features as work progresses and never commit `.env`, generated Kubernetes secrets, credentials, or live patient information.
