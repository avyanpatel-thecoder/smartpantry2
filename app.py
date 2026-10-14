import os
import requests
from flask import Flask, render_template, redirect, url_for, request, jsonify, flash
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from groq import Groq

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'smart-pantry-secret-key-2026')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///pantry.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# --- Database Models ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(150), nullable=False)

class PantryItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.String(50), nullable=False)
    category = db.Column(db.String(50), nullable=True)
    expiry_date = db.Column(db.String(50), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class Recipe(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=True)
    time = db.Column(db.String(50), nullable=True)
    difficulty = db.Column(db.String(50), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# Initialize tables globally so Gunicorn creates them on cloud boot
with app.app_context():
    db.create_all()
    if not User.query.filter_by(username='demo@smartpantry.com').first():
        hashed_pw = generate_password_hash('password123', method='pbkdf2:sha256')
        demo_user = User(username='demo@smartpantry.com', password=hashed_pw)
        db.session.add(demo_user)
        db.session.commit()

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# --- Application Routes ---
@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for('index'))
        flash('Invalid username or password', 'error')
    return render_template('auth.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))

# --- Pantry APIs ---
@app.route('/api/pantry', methods=['GET'])
@login_required
def get_pantry():
    items = PantryItem.query.filter_by(user_id=current_user.id).all()
    return jsonify([{
        'id': item.id,
        'name': item.name,
        'quantity': item.quantity,
        'category': item.category,
        'expiry_date': item.expiry_date
    } for item in items])

@app.route('/api/pantry', methods=['POST'])
@login_required
def add_pantry():
    data = request.get_json()
    new_item = PantryItem(
        name=data.get('name'),
        quantity=data.get('quantity'),
        category=data.get('category', 'Pantry'),
        expiry_date=data.get('expiry_date'),
        user_id=current_user.id
    )
    db.session.add(new_item)
    db.session.commit()
    return jsonify({'success': True, 'id': new_item.id}), 201

@app.route('/api/pantry/<int:item_id>', methods=['DELETE'])
@login_required
def delete_pantry(item_id):
    item = PantryItem.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    db.session.delete(item)
    db.session.commit()
    return jsonify({'success': True})

# --- Recipe APIs ---
@app.route('/api/recipes', methods=['GET'])
@login_required
def get_recipes():
    recipes = Recipe.query.filter_by(user_id=current_user.id).all()
    return jsonify([{
        'id': r.id,
        'title': r.title,
        'description': r.description,
        'time': r.time,
        'difficulty': r.difficulty
    } for r in recipes])

@app.route('/api/recipes/generate', methods=['POST'])
@login_required
def generate_recipe():
    items = PantryItem.query.filter_by(user_id=current_user.id).all()
    item_names = [i.name for i in items] if items else ["Pantry Staples"]
    
    groq_api_key = os.environ.get("GROQ_API_KEY")
    
    if groq_api_key:
        try:
            client = Groq(api_key=groq_api_key)
            prompt = f"Create a short, creative cooking recipe using some of these pantry ingredients: {', '.join(item_names)}. Return the output with a clear title, prep time, difficulty level, and short description."
            
            completion = client.chat.completions.create(
                model="llama3-70b-8192",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=300
            )
            recipe_text = completion.choices[0].message.content
            lines = [line.strip() for line in recipe_text.split('\n') if line.strip()]
            recipe_title = lines[0] if lines else "AI Chef Special"
            
            new_recipe = Recipe(
                title=recipe_title[:100],
                description=recipe_text,
                time="20 mins",
                difficulty="Easy",
                user_id=current_user.id
            )
            db.session.add(new_recipe)
            db.session.commit()
            return jsonify({'success': True, 'title': recipe_title})
        except Exception as e:
            print(f"Groq API error: {e}")

    # Fallback recipe if key is missing or call fails
    recipe_title = f"Fresh {item_names[0]} Skillet"
    new_recipe = Recipe(
        title=recipe_title,
        description=f"A delicious meal whipped up using available ingredients: {', '.join(item_names[:3])}.",
        time="25 mins",
        difficulty="Easy",
        user_id=current_user.id
    )
    db.session.add(new_recipe)
    db.session.commit()
    return jsonify({'success': True, 'title': recipe_title})

# --- Barcode Scanner API (Open Food Facts Integration) ---
@app.route('/api/scan', methods=['POST'])
@login_required
def scan_barcode():
    data = request.get_json()
    barcode = data.get('barcode')
    
    if not barcode:
        return jsonify({'error': 'Barcode is required'}), 400
        
    headers = {'User-Agent': 'SmartPantryApp - Version 1.0'}
    off_url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
    
    try:
        response = requests.get(off_url, headers=headers)
        product_name = f"Scanned Item ({barcode})"
        category = "Pantry"
        
        if response.status_code == 200:
            prod_data = response.json()
            if prod_data.get('status') == 1:
                product = prod_data.get('product', {})
                product_name = product.get('product_name') or product.get('generic_name') or product_name
                categories_list = product.get('categories_tags', [])
                if categories_list:
                    category = categories_list[0].replace('en:', '').capitalize()
                    
        new_item = PantryItem(
            name=product_name,
            quantity="1 unit",
            category=category,
            expiry_date="2026-12-31",
            user_id=current_user.id
        )
        db.session.add(new_item)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f"Added {product_name} via barcode!",
            'item': {'name': product_name, 'category': category}
        }), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
