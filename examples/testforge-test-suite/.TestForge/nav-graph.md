```mermaid
graph TD
  Home["Home"]
  Imghp["Imghp"]
  Home -->|"Images (90%)"| Imghp
  https___www_google_com_setpref["https://www.google.com/setprefs"]
  Home -->|"हिन्दी (100%)"| https___www_google_com_setpref
  https___www_google_com_intl_en["https://www.google.com/intl/en_in/ads"]
  Home -->|"Advertising (90%)"| https___www_google_com_intl_en
  https___www_google_com_service["https://www.google.com/services"]
  Home -->|"Business (90%)"| https___www_google_com_service
  https___www_google_com_prefere["https://www.google.com/preferences"]
  Home -->|"Search settings (90%)"| https___www_google_com_prefere
  https___www_google_com_advance["https://www.google.com/advanced_search"]
  Home -->|"Advanced search (90%)"| https___www_google_com_advance
  https___www_google_com_history["https://www.google.com/history/privacyadvisor/search/unauth"]
  Home -->|"Your data in Search (90%)"| https___www_google_com_history
  Home -->|"Search history (90%)"| https___www_google_com_history
  Imghp -->|"Advertising (90%)"| https___www_google_com_intl_en
  Imghp -->|"Business (90%)"| https___www_google_com_service
  Imghp -->|"Search settings (90%)"| https___www_google_com_prefere
  Imghp -->|"Advanced search (90%)"| https___www_google_com_advance
  Imghp -->|"Search history (90%)"| https___www_google_com_history
```