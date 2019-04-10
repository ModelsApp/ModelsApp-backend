# Dating App API
*The API for the Dating App work project*

To make the app work, there a need in security to hide the confidential
information: API keys. It is hidden in `.env` file and is parsed by **dotenv**
library. Here is how `.env` file looks like:

```
PORT=3000
mongoURI=the_url_from_Mlab_dot_com
cookieKey=the_cookie_key_which_is_used_to_keep_auth_session
instagramClientID=...
instagramClientSecret=...
googleClientID=...
googleClientSecret=...
facebookClientID=...
facebookClientSecret=...
```
# datingapp
# datingapp
