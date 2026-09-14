# Social logins — τι ζητάμε από τον πελάτη

Περιβάλλοντα που δηλώνονται σε **κάθε** εφαρμογή OAuth:

| Περιβάλλον | Origin | Callback (redirect URI) |
|---|---|---|
| Παραγωγή | `https://www.euronics.gr` | `https://www.euronics.gr/api/auth/callback/<provider>` |
| Staging | `https://euronics.dgsoft.gr` | `https://euronics.dgsoft.gr/api/auth/callback/<provider>` |
| Τοπικά | `http://localhost:3000` | `http://localhost:3000/api/auth/callback/<provider>` |

`<provider>` = `google` · `microsoft` · `facebook` · `apple`. Τα στοιχεία μπαίνουν στο **Ρυθμίσεις → Social login** (super admin), ποτέ στον κώδικα. Το ίδιο ID/secret μπορεί να εξυπηρετεί και τα τρία περιβάλλοντα εφόσον έχουν δηλωθεί όλα τα URLs· εναλλακτικά ξεχωριστή εφαρμογή για staging.

## Κοινές προϋποθέσεις
- Δημόσιες σελίδες **Πολιτικής Απορρήτου** και **Όρων Χρήσης** (τις απαιτούν Google, Facebook, Apple για έγκριση).
- Εταιρικός λογαριασμός-ιδιοκτήτης των εφαρμογών (όχι προσωπικός υπαλλήλου) + πρόσβαση Editor στο i4ria σε κάθε console.
- Επωνυμία και λογότυπο για την οθόνη συγκατάθεσης.
- Παράδοση secrets μέσω password manager ή link μιας χρήσης, όχι email.

## 1. Google — console.cloud.google.com
1. Project → **APIs & Services → OAuth consent screen**: External, όνομα «Euronics», support email, λογότυπο, Authorised domains `euronics.gr` και `dgsoft.gr`, URLs απορρήτου/όρων, scopes `email`, `profile`, `openid` → **Publish** (In production).
2. **Credentials → Create OAuth client ID → Web application**
   - Authorised JavaScript origins: `https://www.euronics.gr`, `https://euronics.dgsoft.gr`, `http://localhost:3000`
   - Authorised redirect URIs: τα τρία callbacks `/api/auth/callback/google`
3. Παραδοτέα: **Client ID**, **Client secret**.

## 2. Microsoft — portal.azure.com → Microsoft Entra ID → App registrations
1. **New registration**: όνομα «Euronics eShop», Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*.
2. **Authentication → Add platform → Web**: Redirect URIs τα τρία callbacks `/api/auth/callback/microsoft` (το localhost επιτρέπεται σε http). ID tokens: ενεργά.
3. **Certificates & secrets → New client secret** (λήξη 24 μήνες, σημείωση ημερομηνίας).
4. **API permissions**: Microsoft Graph `openid`, `email`, `profile`, `User.Read` (delegated).
5. Παραδοτέα: **Application (client) ID**, **Client secret VALUE**, **Tenant** (για λιανική: `common`).

## 3. Facebook — developers.facebook.com
1. **Business Verification** του Meta Business λογαριασμού της εταιρείας (χωρίς αυτό το login δουλεύει μόνο για test users).
2. **Create App → Consumer** (ή «Authenticate and request data from users with Facebook Login»), προϊόν **Facebook Login → Settings**:
   - Valid OAuth Redirect URIs: `https://www.euronics.gr/api/auth/callback/facebook`, `https://euronics.dgsoft.gr/api/auth/callback/facebook` (το localhost δουλεύει αυτόματα όσο η εφαρμογή είναι σε Development mode)
   - Client OAuth login: Yes · Web OAuth login: Yes
3. **App settings → Basic**: App domains `euronics.gr`, `dgsoft.gr`, Privacy Policy URL, Terms URL, **User data deletion** = URL της σελίδας GDPR του site (θα δοθεί από εμάς), Category «Shopping & Retail», εικονίδιο 1024×1024.
4. **App mode → Live**. Δικαιώματα `email`, `public_profile` (αυτόματη έγκριση).
5. Παραδοτέα: **App ID**, **App Secret**.

## 4. Apple — developer.apple.com (Apple Developer Program, 99 $/έτος στο όνομα της εταιρείας)
Η Apple δέχεται **μόνο https** return URLs, όχι localhost: τοπικά δοκιμάζεται μέσω του staging.
1. **Certificates, Identifiers & Profiles → Identifiers → App ID** (π.χ. `gr.euronics.app`) με capability **Sign in with Apple**.
2. **Identifiers → Services ID** (π.χ. `gr.euronics.web`), Sign in with Apple → Configure: Primary App ID το παραπάνω, Domains `www.euronics.gr`, `euronics.dgsoft.gr`, Return URLs τα δύο callbacks `/api/auth/callback/apple`.
3. **Keys → new key** με Sign in with Apple → λήψη του **.p8** (μία φορά μόνο).
4. Παραδοτέα: **Services ID**, **Team ID** (πάνω δεξιά στο developer account), **Key ID**, **αρχείο .p8**. Από αυτά παράγουμε εμείς το client secret JWT (λήγει κάθε 6 μήνες, το ανανεώνουμε).

## Μετά την παραλαβή (εμείς)
- Καταχώρηση στο Ρυθμίσεις → Social login, δοκιμή κάθε provider σε staging και παραγωγή.
- Κάθε social σύνδεση δημιουργεί/συνδέει Customer + SocialAccount, με consent ledger και LoginEvent (IP/OS/browser) όπως στο κλασικό login.
- Ημερολόγιο ανανεώσεων: Microsoft secret (24 μήνες), Apple JWT (6 μήνες).
