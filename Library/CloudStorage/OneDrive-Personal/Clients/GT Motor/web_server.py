from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import requests
import os

# TG Media Test Account
API_KEY = "930d10a705862e80d285fe12fea16363cb2d7fa97f4a45aaeac600baa3cff8c2"
BASE_URL = "https://tg-media.booqable.com/api/1"
# 555 Speedway Client Account (Blocked by Plan)
# API_KEY = "732f958a95f5cb60c8064be2f82ef64a9d1bfa4066f33b17cde1f375484894cf"
# BASE_URL = "https://555-speedway.booqable.com/api/1"
# NOTE: API access requires Booqable plan upgrade (currently returns 402)
# Client must enable API access in their Booqable plan settings.
# ------------------------------

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}

class BooqableHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # SECURITY FIX: Prevent serving source code or sensitive files
        if self.path.endswith('.py') or self.path.endswith('.env') or 'web_server' in self.path:
            self.send_error(403, "Access Denied")
            return

        # Redirect root or index to the app HTML
        if self.path == '/' or self.path == '/index.html' or self.path == '/app.html':
            self.path = '/booking_system/static/app.html'
            
        return super().do_GET()

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        # Map '/api/bookings' from app.html to our handler
        if self.path == '/api/bookings' or self.path == '/booking.php':
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            
            try:
                data = json.loads(post_body)
                print("Received Booking Request:", data)
                
                # Extract needed fields from new app structure
                # app.html sends: customer_name, customer_email, booking_date, etc.
                
                # 1. Find or Create Customer
                cust_email = data.get('customer_email', 'guest@example.com')
                cust_name = data.get('customer_name', 'Guest')
                
                print(f"Checking for customer: {cust_email}")
                r_cust_search = requests.get(f"{BASE_URL}/customers?q={cust_email}&per_page=1", headers=HEADERS)
                customer_id = None
                
                # Property Definitions — TG Media Custom Fields (Restored)
                PROP_IDS = {
                    "phone":         "6d40d4f5-8cb6-49cf-9804-88216593a1ed",
                    "date_of_birth": "f4ad91bd-7db2-4043-b0e4-91a18edd95a5",
                    "id_type":       "afc85b3f-8816-4fbd-99b5-4a369c746c46",
                    "id_number":     "db5c761a-e412-4c33-8b0d-107579b99282",
                    "customer_type": "ef4c3907-9ac0-42f4-b0b0-de174defbf70"
                }

                if r_cust_search.status_code == 200 and r_cust_search.json().get('customers'):
                    customer = r_cust_search.json()['customers'][0]
                    customer_id = customer['id']
                    print(f"Found existing customer: {customer_id}")
                    
                    # Update Existing Customer to 'Returning' and refresh details
                    try:
                        # 1. Map existing properties by their definition ID (default_property_id)
                        # We must first fetch the full customer record to get properties because search results might be shallow
                        r_full_cust = requests.get(f"{BASE_URL}/customers/{customer_id}", headers=HEADERS)
                        if r_full_cust.status_code == 200:
                            customer_data = r_full_cust.json().get('customer', {})
                            existing_props = customer_data.get('properties', [])
                        else:
                            existing_props = []

                        existing_props_map = {}
                        for p in existing_props:
                            def_id = p.get('default_property_id')
                            if def_id:
                                existing_props_map[def_id] = p.get('id')
                        
                        props_update = []
                        
                        # Helper to add/update property
                        def add_prop_update(field_name, new_val):
                            def_id = PROP_IDS.get(field_name)
                            if not def_id: return
                            
                            prop_entry = {
                                "default_property_id": def_id,
                                "value": new_val
                            }
                            
                            # If this property already exists for the customer, include its ID to update it
                            if def_id in existing_props_map:
                                prop_entry["id"] = existing_props_map[def_id]
                            
                            props_update.append(prop_entry)
                        
                        # Add fields using the helper
                        if data.get('customer_phone'):
                            add_prop_update('phone', data.get('customer_phone'))
                            
                        add_prop_update('customer_type', "Returning")
                        
                        if data.get('customer_dob'):
                             add_prop_update('date_of_birth', data.get('customer_dob'))
                        
                        if data.get('id_type'):
                             add_prop_update('id_type', data.get('id_type'))
                             
                        if data.get('id_number'):
                             add_prop_update('id_number', data.get('id_number'))
                        
                        update_payload = {
                            "customer": {
                                "name": cust_name, 
                                "properties_attributes": props_update
                            }
                        }
                        
                        r_update = requests.put(f"{BASE_URL}/customers/{customer_id}", json=update_payload, headers=HEADERS)
                        
                        if r_update.status_code != 200:
                             print(f"Update Failed: {r_update.status_code} {r_update.text}")
                        else:
                             print(f"Updated Customer Status to Returning: {r_update.status_code}")
                            
                    except Exception as e:
                        print(f"Failed to update existing customer: {e}")

                else:
                    print("Customer not found, creating new one...")
                    
                    props_list = []
                    # Phone
                    if data.get('customer_phone') and PROP_IDS.get('phone'):
                        props_list.append({
                            "default_property_id": PROP_IDS['phone'],
                            "value": data.get('customer_phone')
                        })
                    # DOB
                    if data.get('customer_dob') and PROP_IDS.get('date_of_birth'):
                        props_list.append({
                            "default_property_id": PROP_IDS['date_of_birth'],
                            "value": data.get('customer_dob')
                        })
                    # ID Type
                    if data.get('id_type') and PROP_IDS.get('id_type'):
                        props_list.append({
                            "default_property_id": PROP_IDS['id_type'],
                            "value": data.get('id_type')
                        })
                    # ID Number
                    if data.get('id_number') and PROP_IDS.get('id_number'):
                        props_list.append({
                            "default_property_id": PROP_IDS['id_number'],
                            "value": data.get('id_number')
                        })
                    
                    # Customer Type (Default to 'First Time' for new customers)
                    if PROP_IDS.get('customer_type'):
                        c_type = data.get('customer_type', 'First Time')
                        props_list.append({
                            "default_property_id": PROP_IDS['customer_type'],
                            "value": c_type
                        })

                    cust_payload = {
                        "customer": {
                            "name": cust_name,
                            "email": cust_email,
                            "properties_attributes": props_list
                        }
                    }
                    r_cust_create = requests.post(f"{BASE_URL}/customers", json=cust_payload, headers=HEADERS)
                    if r_cust_create.status_code == 201:
                        customer_id = r_cust_create.json().get('customer', {}).get('id')
                        print(f"Created new customer: {customer_id}")
                    else:
                        print(f"Failed to create customer: {r_cust_create.text}")
                        # Fallback to guest logic or error? For now proceed and see if order fails without ID?
                        # Actually if we fail here, order creation without ID is what caused the invisible order.
                        # We should probably error out or default to a "Walk-in" customer if one exists.
                        pass

                # 2. Create Order with Customer ID
                order_payload = {
                    "order": {
                        "customer_id": customer_id,
                        "status": "draft", # Start as draft (concept) so items aren't auto-reserved
                        "starts_at": data.get('booking_date', '') + "T09:00:00",
                        "stops_at": data.get('booking_date', '') + "T17:00:00",
                    }
                }
                
                print("Creating Order...")
                r_order = requests.post(f"{BASE_URL}/orders", json=order_payload, headers=HEADERS)
                
                if r_order.status_code == 201:
                    order_res = r_order.json().get('order', {})
                    order_id = order_res.get('id')
                    print(f"Order Created: {order_id}")
                    
                    # 2. Add Line Item with Product Mapping (New Endpoint)
                    
                    # ID MAP for Products (From User CSV) - TG MEDIA (TEST ACCOUNT 5 MAR 2026)
                    PRODUCT_MAP = {
                        # Standard sessions
                        "SINGLE_6":  "57cabcec-851c-449c-b39d-f9d708e0c47d",  # Single Seat 6 mins test
                        "SINGLE_10": "548ab780-d9b5-4902-af2c-7559dd4a314d",  # Single Seat 10 mins test
                        "DOUBLE_6":  "fa1fcc74-0cc5-4a95-a14e-677b5d7e2553",  # Double Seat 6 mins test
                        "DOUBLE_10": "988bb186-ee63-4549-8ee6-4c145e464961",  # Double Seat 10 mins test

                        # Wednesday Special (8 min) - mapped to 6
                        "SINGLE_8":  "57cabcec-851c-449c-b39d-f9d708e0c47d",
                        "DOUBLE_8":  "fa1fcc74-0cc5-4a95-a14e-677b5d7e2553",

                        # Private Track Pass (Kart)
                        "PRIVATE_KART_WKND": "8cade778-f49e-4b2b-ae00-9347bc6aa723",
                        "PRIVATE_KART_WEEK": "4a4e77e6-3618-4d65-9089-d3ee60c8b843",

                        # Private Track Pass (Bike)
                        "PRIVATE_BIKE_WKND": "cd0aa4ff-df81-40a5-be36-8b39a6367492",
                        "PRIVATE_BIKE_WEEK": "399e39ae-47bb-4e0d-ae14-b7d28a8e52a8",

                        # Track Day Pass
                        "TRACK_DAY_PASS":    "49957d46-62a9-4a22-a4e3-60792e81fc97",  # Keep existing for now if matched

                        # Race Day Qualifier
                        "RACE_DAY_QUALIFIER": "PENDING_PRODUCT_CREATION"
                    }

                    # Determine Product ID based on Logic
                    kart_type = data.get('kart_type', '').upper() # e.g. "SINGLE SEAT (6 MINS)"
                    booking_date_str = data.get('booking_date')
                    
                    # Logic to pick ID
                    target_variant_id = None
                    
                    if "QUALIFIER" in kart_type:
                        target_variant_id = PRODUCT_MAP.get("RACE_DAY_QUALIFIER")
                        # Placeholder warning if not set
                        if target_variant_id == "pending-product-id-from-user":
                            print("Warning: Qualifier booked but Product ID not yet configured.")
                            # Fallback or keep as placeholder to fail gracefully
                    
                    # Check for Private Pass First
                    elif "PRIVATE" in kart_type:
                        # Determine Day of Week
                        from datetime import datetime
                        dt = datetime.strptime(booking_date_str, "%Y-%m-%d")
                        day_idx = dt.weekday() # 0=Mon, 6=Sun
                        is_weekend = (day_idx >= 4) # Fri(4), Sat(5), Sun(6)? User said Fri-Sun is wknd
                        
                        category = data.get('category_type', 'Kart').upper() # Kart or Bike
                        
                        suffix = "_WKND" if is_weekend else "_WEEK"
                        key = f"PRIVATE_{category}{suffix}"
                        target_variant_id = PRODUCT_MAP.get(key)
                    
                    else:
                        # Regular Sessions
                        # Check if title has explicit minutes (updated by frontend JS)
                        minutes = "6" # default
                        if "8 MIN" in kart_type: minutes = "8"
                        elif "10 MIN" in kart_type: minutes = "10"
                        
                        base = "SINGLE" if "SINGLE" in kart_type else "DOUBLE"
                        target_variant_id = PRODUCT_MAP.get(f"{base}_{minutes}")

                    # Fallback if logic fails
                    if not target_variant_id:
                         print(f"Warning: Could not map product for {kart_type} on {booking_date_str}. Using default SINGLE_6.")
                         target_variant_id = PRODUCT_MAP["SINGLE_6"]

                    print(f"Mapped to Variant ID: {target_variant_id}")
                    
                    qty = data.get('quantity', 1)
                    
                    # Use the /book endpoint instead of /lines to ensure actual product selection
                    # Payload format: { "ids": { "product_id": quantity } }
                    book_payload = {
                        "ids": {
                            target_variant_id: qty
                        }
                    }

                    print(f"Booking Payload: {book_payload}")
                    r_line = requests.post(f"{BASE_URL}/orders/{order_id}/book", json=book_payload, headers=HEADERS)
                    
                    if r_line.status_code in [200, 201]:
                        print("Line Added Successfully")
                        
                        # Return what app.html expects
                        # We will transition to 'reserved' or stay 'draft'
                        # NEW LOGIC: Default to DRAFT if status is missing or explicitly 'draft'
                        # Only reserve if explicitly requested as 'reserved'
                        requested_status = data.get('status', 'draft') 
                        
                        if requested_status == 'draft':
                            print("Status is 'draft'. Skipping reservation step.")
                            final_number = order_res.get('number', 'DRAFT')
                            
                        elif requested_status == 'reserved':
                            print("Status is 'reserved'. Transitioning...")
                            try:
                                r_reserve = requests.post(f"{BASE_URL}/orders/{order_id}/reserve", headers=HEADERS)
                                if r_reserve.status_code in [200, 201]:
                                    final_number = r_reserve.json()['order'].get('number')
                                    print(f"Order Reserved! Number: {final_number}")
                                else:
                                    print(f"Failed to Reserve: {r_reserve.status_code} {r_reserve.text}")
                                    final_number = "ERROR-RESERVING"
                            except Exception as e:
                                print(f"Exception reserving: {e}")
                                final_number = "ERROR"

                        # --- TICKET NUMBER LOGIC ---
                        # Read and increment local ticket counter
                        ticket_num = 126
                        try:
                            if os.path.exists('ticket_counter.txt'):
                                with open('ticket_counter.txt', 'r') as f:
                                    val = f.read().strip()
                                    if val.isdigit():
                                        ticket_num = int(val) + 1
                            
                            # Update counter file
                            with open('ticket_counter.txt', 'w') as f:
                                f.write(str(ticket_num))
                                
                        except Exception as e:
                            print(f"Error updating ticket counter: {e}")
                            ticket_num = 9999 # Fallback

                        response_data = {
                            "status": "success",
                            "booking_id": order_id, # Our ID
                            "ticket_number": f"#{ticket_num}" # Custom Sequential Ticket #
                        }
                        
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*') # CORS!
                        self.end_headers()
                        self.wfile.write(json.dumps(response_data).encode())
                    else:
                        print(f"Line Add Failed: {r_line.status_code} - {r_line.text}")
                        # Even if line fails, return success for order creation but maybe warn?
                        self.send_response(200) 
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "status": "partial", 
                            "booking_id": order_id,
                            "warning": "Order created but item add failed."
                        }).encode())
                else:
                    print(f"Order Failed: {r_order.status_code} - {r_order.text}")
                    self.send_response(400)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(r_order.content)
            
            except Exception as e:
                print(f"Server Error: {e}")
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            super().do_POST()

if __name__ == '__main__':
    # Runs on 8000 internally — Nginx handles 80/443 externally
    server_address = ('', 8000)
    print("Starting booking server on port 8000 (internal)...")
    try:
        httpd = HTTPServer(server_address, BooqableHandler)
        httpd.serve_forever()
    except PermissionError:
        print("Error: Could not bind port.")
