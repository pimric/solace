import requests
import os
from dotenv import load_dotenv

load_dotenv()

class ACLEDClient:
    BASE_URL = "https://acleddata.com/api/"
    TOKEN_URL = "https://acleddata.com/oauth/token"

    def __init__(self, email=None, password=None):
        self.email = email or os.getenv("ACLED_EMAIL")
        self.password = password or os.getenv("ACLED_PASSWORD")
        self.access_token = None

    def authenticate(self):
        """Request an OAuth Access Token."""
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        data = {
            'username': self.email,
            'password': self.password,
            'grant_type': "password",
            'client_id': "acled",
            'scope': "authenticated"
        }

        response = requests.post(self.TOKEN_URL, headers=headers, data=data)

        if response.status_code == 200:
            token_data = response.json()
            self.access_token = token_data['access_token']
            return self.access_token
        else:
            raise Exception(f"Failed to get access token: {response.status_code} {response.text}")

    def get_data(self, endpoint="acled", params=None):
        """Fetch data from the specified endpoint."""
        if not self.access_token:
            self.authenticate()

        url = f"{self.BASE_URL}{endpoint}/read"
        
        # Default format to JSON if not specified
        if params is None:
            params = {}
        if '_format' not in params:
            params['_format'] = 'json'

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

        response = requests.get(url, headers=headers, params=params)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"API request failed: {response.status_code} {response.text}")

if __name__ == "__main__":
    # Example usage
    try:
        client = ACLEDClient()
        # Example: Fetch 10 events from Georgia in 2023
        parameters = {
            "country": "Georgia",
            "year": 2023,
            "limit": 10
        }
        data = client.get_data(params=parameters)
        print(data)
    except Exception as e:
        print(f"Error: {e}")
