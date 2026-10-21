targetScope = 'subscription'

@minLength(1)
param environmentName string
param location string
param principalId string
param tenantId string = tenant().tenantId
@minLength(1)
param apiClientId string
param debuggerModule string = ''
param mainModelName string = 'gpt-4.1-mini'
param mainModelVersion string = '2025-04-14'
param lightModelName string = 'gpt-4.1-nano'
param lightModelVersion string = '2025-04-14'
@minValue(1)
param modelCapacity int = 10
@minValue(1)
param monthlyBudget int = 25
@minLength(1)
param budgetEmail string

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-rootcause-${environmentName}'
  location: location
  tags: { 'azd-env-name': environmentName }
}

module resources './resources.bicep' = {
  name: 'rootcause-resources'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    principalId: principalId
    tenantId: tenantId
    apiClientId: apiClientId
    debuggerModule: debuggerModule
    mainModelName: mainModelName
    mainModelVersion: mainModelVersion
    lightModelName: lightModelName
    lightModelVersion: lightModelVersion
    modelCapacity: modelCapacity
    monthlyBudget: monthlyBudget
    budgetEmail: budgetEmail
  }
}

output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.registryEndpoint
output AZURE_CONTAINER_REGISTRY_NAME string = resources.outputs.registryName
output AZURE_CONTAINER_APPS_ENVIRONMENT_ID string = resources.outputs.environmentId
output API_URL string = resources.outputs.apiUrl
output FRONTEND_URL string = resources.outputs.frontendUrl
output FOUNDRY_PROJECT_ENDPOINT string = resources.outputs.foundryEndpoint
output COSMOS_ENDPOINT string = resources.outputs.cosmosEndpoint
output EVENTHUB_NAMESPACE string = resources.outputs.eventhubNamespace
output AZURE_KEY_VAULT_ENDPOINT string = resources.outputs.vaultEndpoint
output APPLICATIONINSIGHTS_CONNECTION_STRING string = resources.outputs.insightsConnection

output AZURE_CONTAINER_APP_API_NAME string = resources.outputs.apiName
output AZURE_CONTAINER_APP_FRONTEND_NAME string = resources.outputs.frontendName
output AZURE_FUNCTION_NAME string = resources.outputs.detectorName

output EVALUATION_MODEL_ENDPOINT string = resources.outputs.evaluationEndpoint
