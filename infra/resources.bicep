param location string
param environmentName string
param principalId string
param tenantId string
param apiClientId string
param debuggerModule string
param mainModelName string
param mainModelVersion string
param lightModelName string
param lightModelVersion string
param modelCapacity int
param monthlyBudget int
param budgetEmail string
param budgetStartDate string = utcNow('yyyy-MM')

var suffix = uniqueString(resourceGroup().id)
var tags = { 'azd-env-name': environmentName }

resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-api-${suffix}'
  location: location
}
resource detectorIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-detector-${suffix}'
  location: location
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'acr${suffix}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, apiIdentity.id, 'pull')
  scope: registry
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'logs-${suffix}'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'insights-${suffix}'
  location: location
  kind: 'web'
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id }
}
resource workbook 'Microsoft.Insights/workbooks@2022-04-01' = {
  name: guid(insights.id, 'rootcause-workflow-workbook')
  location: location
  kind: 'shared'
  properties: {
    displayName: 'Root Cause latency and model usage'
    serializedData: loadTextContent('./workbook.json')
    category: 'workbook'
    sourceId: insights.id
  }
}
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${suffix}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: 'cosmos-${suffix}'
  location: location
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    capabilities: [{ name: 'EnableServerless' }]
    locations: [{ locationName: location, failoverPriority: 0 }]
    disableLocalAuth: true
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
  }
}
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'rootcause'
  properties: { resource: { id: 'rootcause' } }
}
resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for name in ['goals', 'traces', 'verdicts', 'agent_steps']: {
  parent: database
  name: name
  properties: {
    resource: {
      id: name
      partitionKey: { paths: ['/match_id'], kind: 'Hash' }
      defaultTtl: -1
    }
  }
}]
resource cosmosAccess 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = [for identity in ['api', 'detector']: {
  parent: cosmos
  name: guid(cosmos.id, identity, 'data')
  properties: {
    principalId: identity == 'api' ? apiIdentity.properties.principalId : detectorIdentity == 'api' ? apiIdentity.properties.principalId : detectorIdentity.properties.principalId
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    scope: cosmos.id
  }
}]
resource hubNamespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: 'eh-${suffix}'
  location: location
  sku: { name: 'Standard', tier: 'Standard', capacity: 1 }
  properties: { disableLocalAuth: true, isAutoInflateEnabled: false, minimumTlsVersion: '1.2' }
}
resource hub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  parent: hubNamespace
  name: 'match-events'
  properties: { partitionCount: 2, messageRetentionInDays: 1 }
}
resource groups 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2024-01-01' = [for name in ['api', 'detector']: {
  parent: hub
  name: name
}]
resource hubReceivers 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for identity in ['api', 'detector']: {
  name: guid(hubNamespace.id, identity, 'receiver')
  scope: hubNamespace
  properties: {
    principalId: identity == 'api' ? apiIdentity.properties.principalId : detectorIdentity == 'api' ? apiIdentity.properties.principalId : detectorIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a638d3c7-ab3a-418d-83e6-5f17a39d4fde')
  }
}]
resource hubSender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(hubNamespace.id, apiIdentity.id, 'sender')
  scope: hubNamespace
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2b629674-e913-4c01-ae53-ef4638d8f975')
  }
}
resource foundry 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'foundry-${suffix}'
  location: location
  kind: 'AIServices'
  sku: { name: 'S0' }
  identity: { type: 'SystemAssigned' }
  properties: {
    customSubDomainName: 'foundry-${suffix}'
    allowProjectManagement: true
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}
resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: foundry
  name: 'rootcause'
  location: location
  identity: { type: 'SystemAssigned' }
  properties: { displayName: 'Root Cause', description: 'Evidence-grounded goal analysis' }
}
resource mainDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: 'main'
  sku: { name: 'GlobalStandard', capacity: modelCapacity }
  properties: { model: { format: 'OpenAI', name: mainModelName, version: mainModelVersion } }
}
resource lightDeployment 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: foundry
  name: 'light'
  sku: { name: 'GlobalStandard', capacity: modelCapacity }
  properties: { model: { format: 'OpenAI', name: lightModelName, version: lightModelVersion } }
}
resource foundryUsers 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for target in ['api', 'developer']: {
  name: guid(foundry.id, target == 'api' ? apiIdentity.id : principalId, 'aiuser')
  scope: foundry
  properties: {
    principalId: target == 'api' ? apiIdentity.properties.principalId : principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')
  }
}]
resource aiServices 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'services-${suffix}'
  location: location
  kind: 'CognitiveServices'
  sku: { name: 'S0' }
  properties: { customSubDomainName: 'services-${suffix}', disableLocalAuth: true }
}
resource aiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(aiServices.id, apiIdentity.id, 'user')
  scope: aiServices
  properties: {
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a97b65f3-24c7-4388-baec-2e87135dc908')
  }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${suffix}'
  location: location
  properties: { tenantId: tenantId, sku: { family: 'A', name: 'standard' }, enableRbacAuthorization: true, enableSoftDelete: true }
}
resource vaultUsers 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for identity in ['api', 'detector']: {
  name: guid(vault.id, identity, 'secrets')
  scope: vault
  properties: {
    principalId: identity == 'api' ? apiIdentity.properties.principalId : detectorIdentity == 'api' ? apiIdentity.properties.principalId : detectorIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}]
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${suffix}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2', supportsHttpsTrafficOnly: true }
}
resource storageAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for role in [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Blob Data Owner for Function host
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Queue Data Contributor
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Table Data Contributor
]: {
  name: guid(storage.id, detectorIdentity.id, role)
  scope: storage
  properties: {
    principalId: detectorIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
  }
}]
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'func-plan-${suffix}'
  location: location
  sku: { name: 'Y1', tier: 'Dynamic' }
  properties: { reserved: true }
}
resource detector 'Microsoft.Web/sites@2023-12-01' = {
  name: 'detector-${suffix}'
  location: location
  kind: 'functionapp,linux'
  tags: union(tags, { 'azd-service-name': 'detector' })
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${detectorIdentity.id}': {} } }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appSettings: [
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'python' }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: detectorIdentity.properties.clientId }
        { name: 'EventHubConnection__fullyQualifiedNamespace', value: '${hubNamespace.name}.servicebus.windows.net' }
        { name: 'EventHubConnection__credential', value: 'managedidentity' }
        { name: 'EventHubConnection__clientId', value: detectorIdentity.properties.clientId }
        { name: 'AZURE_CLIENT_ID', value: detectorIdentity.properties.clientId }
        { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
        { name: 'DEBUGGER_MODULE', value: debuggerModule }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
      ]
    }
  }
}
resource frontend 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'frontend-${suffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'frontend' })
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${apiIdentity.id}': {} } }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: { external: true, targetPort: 8080, allowInsecure: false }
      registries: [{ server: registry.properties.loginServer, identity: apiIdentity.id }]
    }
    template: {
      containers: [{ name: 'frontend', image: 'mcr.microsoft.com/k8se/quickstart:latest', resources: { cpu: json('0.25'), memory: '0.5Gi' } }]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}
resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'api-${suffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'api' })
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${apiIdentity.id}': {} } }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      ingress: { external: true, targetPort: 8000, allowInsecure: false }
      registries: [{ server: registry.properties.loginServer, identity: apiIdentity.id }]
    }
    template: {
      containers: [{
        name: 'api'
        image: 'mcr.microsoft.com/k8se/quickstart:latest'
        resources: { cpu: json('0.5'), memory: '1Gi' }
        env: [
          { name: 'ROOTCAUSE_MODE', value: 'azure' }
          { name: 'AZURE_CLIENT_ID', value: apiIdentity.properties.clientId }
          { name: 'AZURE_TENANT_ID', value: tenantId }
          { name: 'API_CLIENT_ID', value: apiClientId }
          { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
          { name: 'FOUNDRY_PROJECT_ENDPOINT', value: 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}' }
          { name: 'EVENTHUB_NAMESPACE', value: '${hubNamespace.name}.servicebus.windows.net' }
          { name: 'CONTENT_SAFETY_ENDPOINT', value: 'https://${aiServices.name}.cognitiveservices.azure.com/' }
          { name: 'TRANSLATOR_ENDPOINT', value: 'https://${aiServices.name}.cognitiveservices.azure.com/' }
          { name: 'SPEECH_ENDPOINT', value: 'https://${aiServices.name}.cognitiveservices.azure.com/' }
          { name: 'SPEECH_RESOURCE_ID', value: aiServices.id }
          { name: 'AZURE_LOCATION', value: location }
          { name: 'FRONTEND_ORIGIN', value: 'https://${frontend.properties.configuration.ingress.fqdn}' }
          { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        ]
        probes: [
          { type: 'Liveness', httpGet: { path: '/health', port: 8000 }, initialDelaySeconds: 30, periodSeconds: 30 }
          { type: 'Readiness', httpGet: { path: '/ready', port: 8000 }, initialDelaySeconds: 30, periodSeconds: 10 }
        ]
      }]
      // One API replica keeps Event Hubs consumption and WebSocket delivery on the same owner.
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
  dependsOn: [acrPull, cosmosAccess, hubReceivers, foundryUsers, aiUser]
}
resource budget 'Microsoft.Consumption/budgets@2023-11-01' = {
  name: 'rootcause-monthly'
  properties: {
    category: 'Cost'
    amount: monthlyBudget
    timeGrain: 'Monthly'
    timePeriod: { startDate: '${budgetStartDate}-01T00:00:00Z' }
    notifications: {
      Actual80Percent: { enabled: true, operator: 'GreaterThan', threshold: 80, contactEmails: [budgetEmail], thresholdType: 'Actual' }
    }
  }
}
output registryEndpoint string = registry.properties.loginServer
output registryName string = registry.name
output environmentId string = environment.id
output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output frontendUrl string = 'https://${frontend.properties.configuration.ingress.fqdn}'
output foundryEndpoint string = 'https://${foundry.name}.services.ai.azure.com/api/projects/${project.name}'
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output eventhubNamespace string = '${hubNamespace.name}.servicebus.windows.net'
output vaultEndpoint string = vault.properties.vaultUri
output insightsConnection string = insights.properties.ConnectionString

output apiName string = api.name
output frontendName string = frontend.name
output detectorName string = detector.name
