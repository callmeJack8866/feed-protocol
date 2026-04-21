import os

def replace_in_file(filepath, replacements):
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}, does not exist")
        return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements.items():
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

app_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\App.tsx'
app_replacements = {
    "'Connect Your Wallet'": "'Initialize Node Link'",
    "'Connect your wallet to access the Feed Engine dashboard, manage orders, and earn rewards.'": "'Initialize your node link to access the Node Terminal, accept missions, and earn rewards.'",
    "'Profile Load Failed'": "'Node Profile Load Failed'",
}
replace_in_file(app_path, app_replacements)


order_detail_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\components\OrderDetailModal.tsx'
order_detail_replacements = {
    "'CONTINUE FEED'": "t.orderDetail.continueMission || 'CONTINUE MISSION'",
}
replace_in_file(order_detail_path, order_detail_replacements)


layout_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\components\Layout.tsx'
layout_replacements = {
    "'Connecting...'": "t.layout.connecting",
}
replace_in_file(layout_path, layout_replacements)

# Ensure the new key translate exists in EN and ZH for continueMission
en_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\i18n\translations\en.ts'
zh_path = r'f:\Unstandardized_Products\FeedEngine\feed-engine\i18n\translations\zh.ts'

with open(en_path, 'r', encoding='utf-8') as f: EN = f.read()
if 'continueMission:' not in EN:
    EN = EN.replace("protocolBusy: 'PROTOCOL BUSY',", "protocolBusy: 'PROTOCOL BUSY',\n        continueMission: 'CONTINUE MISSION',")
with open(en_path, 'w', encoding='utf-8') as f: f.write(EN)

with open(zh_path, 'r', encoding='utf-8') as f: ZH = f.read()
if 'continueMission:' not in ZH:
    ZH = ZH.replace("protocolBusy: '协议繁忙',", "protocolBusy: '协议繁忙',\n        continueMission: '继续执行任务',")
with open(zh_path, 'w', encoding='utf-8') as f: f.write(ZH)


print("React components updated successfully.")
