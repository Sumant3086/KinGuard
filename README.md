<div align="center">
<img src="../client/src/assets/img/logo 32px32px.png" alt="KinMarché" width="56" height="56" />

# KinMarché Documentation

</div>

Welcome to the KinMarché technical and user documentation. Use the table below to navigate to the guide you need.

---


## Documentation Index

| Document | Audience | Description |
|----------|----------|-------------|
| [Getting Started](getting-started.md) | Developers | Installation, environment setup, first run |
| [Architecture](architecture.md) | Developers | System design, data flow, component map, key decisions |
| [API Reference](api-reference.md) | Developers / Integrators | Complete REST API with request/response examples |
| [Database Schema](database-schema.md) | Developers / DBAs | Table definitions, indexes, relationships, data dictionary |
| [Deployment](deployment.md) | DevOps / Developers | Production deployment guide for VPS, Railway, Vercel, Supabase |
| [Security](security.md) | Developers / Security | Auth model, store isolation, threat controls, operational checklist |
| [Admin Guide](user-guide/admin-guide.md) | Administrators | End-to-end guide for L&P managers running inventory cycles |
| [Store Manager Guide](user-guide/store-manager-guide.md) | Store Managers | Step-by-step counting and submission guide |

---

## Quick Links

- [Back to main README](../README.md)
- [Open an issue on GitHub](https://github.com/Sumant3086/KinGuard/issues)

---

## System at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    KinMarché Platform                        │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────────────┐  │
│  │  Administrator   │        │    Store Manager (×N)    │  │
│  │                  │        │                          │  │
│  │ • Upload cycles  │        │ • Enter physical counts  │  │
│  │ • Set deadlines  │        │ • Note discrepancies     │  │
│  │ • Monitor stores │        │ • Submit by deadline     │  │
│  │ • Export reports │        │ • Download own report    │  │
│  └────────┬─────────┘        └───────────┬──────────────┘  │
│           │                              │                  │
│           └──────────┬───────────────────┘                  │
│                      │                                      │
│              ┌───────▼────────┐                             │
│              │  Express API   │                             │
│              │  + PostgreSQL  │                             │
│              └────────────────┘                             │
└─────────────────────────────────────────────────────────────┘
```

---

*KinMarché · Kinshasa, DRC · Loss & Prevention Platform*
