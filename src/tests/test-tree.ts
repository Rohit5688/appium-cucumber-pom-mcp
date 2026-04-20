import { MobileSmartTreeService } from '../services/execution/MobileSmartTreeService.js';

const sampleXml = `
<hierarchy>
  <android.widget.EditText resource-id="com.app:id/username" text="" content-desc="Username field" clickable="true" enabled="true" bounds="[0,0][1080,180]"/>
  <android.widget.EditText resource-id="com.app:id/password" text="" content-desc="Password field" clickable="true" enabled="true" password="true" bounds="[0,200][1080,380]"/>
  <android.widget.Button resource-id="com.app:id/login_btn" text="Login" content-desc="Login" clickable="true" enabled="true" bounds="[0,400][1080,540]"/>
</hierarchy>
`;

const service = MobileSmartTreeService.getInstance();
const map = service.buildSparseMap(sampleXml, 'android', 'LoginScreen');

console.assert(map.interactiveCount === 3, 'Should find 3 interactive elements');
console.assert(map.elements[0].states.includes('editable'), 'Username should be editable');
console.assert(map.elements[1].states.includes('secure'), 'Password should be secure');
console.assert(map.elements[2].role === 'button', 'Login should be button');

console.log('Action Map Output:');
console.log(map.dehydratedText);
console.log('Compression ratio:', (sampleXml.length / map.dehydratedText.length).toFixed(1) + 'x');
