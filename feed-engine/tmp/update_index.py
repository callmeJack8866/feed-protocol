import re

filepath = r'f:\Unstandardized_Products\FeedEngine\feed-engine\index.html'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the Tailwind CDN script
content = re.sub(r'<script src="https://cdn.tailwindcss.com"></script>\s*', '', content)

# Remove the entire <style> block
content = re.sub(r'<style>.*?</style>\s*', '', content, flags=re.DOTALL)

# Update the perspective grid and hud-overlay classes
content = content.replace('class="perspective-grid"', 'class="layout-grid-floor"')
content = content.replace('class="hud-overlay"', 'class="layout-hud-overlay"')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated index.html successfully')
