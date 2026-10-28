package expo.modules.manager247billing

import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import java.util.Locale

class Manager247BillingModule : Module(), PurchasesUpdatedListener {
  private data class ConnectionTask(
    val onConnected: (BillingClient) -> Unit,
    val onFailure: (Int) -> Unit,
  )

  private data class ActivePurchase(
    val productId: String,
    val promise: Promise,
  )

  private val connectionLock = Any()
  private val connectionTasks = mutableListOf<ConnectionTask>()
  private var billingClient: BillingClient? = null
  private var isConnecting = false
  private var activePurchase: ActivePurchase? = null

  override fun definition() = ModuleDefinition {
    Name("Manager247Billing")
    Events("onPurchaseUpdated")

    AsyncFunction("connect") { productId: String, promise: Promise ->
      if (productId.isBlank()) {
        reject(promise, "connect", "Missing subscription product id")
        return@AsyncFunction
      }
      withConnectedClient(
        onConnected = { client ->
          queryProductDetails(
            client,
            productId,
            onSuccess = { details ->
              queryOwnedPurchases(
                client,
                productId,
                onSuccess = { purchases ->
                  purchases.forEach(::emitPurchaseUpdate)
                  promise.resolve(productMap(details))
                },
                onFailure = { code -> rejectBilling(promise, "connect.restore", code) },
              )
            },
            onFailure = { code -> rejectBilling(promise, "connect.product", code) },
          )
        },
        onFailure = { code -> rejectBilling(promise, "connect", code) },
      )
    }

    AsyncFunction("purchase") {
        productId: String,
        offerToken: String,
        userId: String,
        promise: Promise,
      ->
      if (productId.isBlank() || offerToken.isBlank() || userId.isBlank()) {
        reject(promise, "purchase", "Incomplete purchase request")
        return@AsyncFunction
      }
      if (activePurchase != null) {
        reject(promise, "purchase", "Another billing flow is already active")
        return@AsyncFunction
      }
      withConnectedClient(
        onConnected = { client ->
          queryProductDetails(
            client,
            productId,
            onSuccess = { details ->
              val eligibleOffer = details.subscriptionOfferDetails
                ?.firstOrNull { it.offerToken == offerToken }
              if (eligibleOffer == null) {
                reject(promise, "purchase.offer", "The selected offer is no longer available")
                return@queryProductDetails
              }
              val activity = appContext.currentActivity
              if (activity == null) {
                reject(promise, "purchase.activity", "No foreground Android activity")
                return@queryProductDetails
              }
              val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(details)
                .setOfferToken(eligibleOffer.offerToken)
                .build()
              val flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(listOf(productParams))
                .setObfuscatedAccountId(sha256(userId))
                .build()

              activePurchase = ActivePurchase(productId, promise)
              activity.runOnUiThread {
                val result = client.launchBillingFlow(activity, flowParams)
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                  when (result.responseCode) {
                    BillingClient.BillingResponseCode.USER_CANCELED -> resolveCancellation(productId)
                    BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                      resolveOwnedPurchase(client, productId)
                    }
                    else -> failActivePurchase(productId, result.responseCode)
                  }
                }
              }
            },
            onFailure = { code -> rejectBilling(promise, "purchase.product", code) },
          )
        },
        onFailure = { code -> rejectBilling(promise, "purchase.connect", code) },
      )
    }

    AsyncFunction("restore") { productId: String, promise: Promise ->
      if (productId.isBlank()) {
        reject(promise, "restore", "Missing subscription product id")
        return@AsyncFunction
      }
      withConnectedClient(
        onConnected = { client ->
          queryOwnedPurchases(
            client,
            productId,
            onSuccess = { purchases -> promise.resolve(purchases.map(::purchaseMap)) },
            onFailure = { code -> rejectBilling(promise, "restore", code) },
          )
        },
        onFailure = { code -> rejectBilling(promise, "restore.connect", code) },
      )
    }

    AsyncFunction("disconnect") {
      destroyClient()
    }

    OnDestroy {
      destroyClient()
    }
  }

  override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
    val active = activePurchase
    if (result.responseCode == BillingClient.BillingResponseCode.USER_CANCELED) {
      active?.let { resolveCancellation(it.productId) }
      return
    }
    if (result.responseCode != BillingClient.BillingResponseCode.OK) {
      active?.let { failActivePurchase(it.productId, result.responseCode) }
      return
    }

    val received = purchases.orEmpty()
    val matching = active?.let { current ->
      received.firstOrNull { current.productId in it.products }
    }
    if (active != null && matching != null) {
      activePurchase = null
      active.promise.resolve(purchaseMap(matching))
    }
    received.filterNot { it === matching }.forEach(::emitPurchaseUpdate)
  }

  private fun getOrCreateClient(): BillingClient {
    billingClient?.let { return it }
    val context = appContext.reactContext
      ?: throw IllegalStateException("React context is unavailable")
    return BillingClient.newBuilder(context)
      .setListener(this)
      .enablePendingPurchases(
        PendingPurchasesParams.newBuilder()
          .enableOneTimeProducts()
          .enablePrepaidPlans()
          .build(),
      )
      .enableAutoServiceReconnection()
      .build()
      .also { billingClient = it }
  }

  private fun withConnectedClient(
    onConnected: (BillingClient) -> Unit,
    onFailure: (Int) -> Unit,
  ) {
    val client = try {
      getOrCreateClient()
    } catch (_: Throwable) {
      onFailure(BillingClient.BillingResponseCode.ERROR)
      return
    }
    if (client.isReady) {
      onConnected(client)
      return
    }

    var shouldStart = false
    synchronized(connectionLock) {
      connectionTasks.add(ConnectionTask(onConnected, onFailure))
      if (!isConnecting) {
        isConnecting = true
        shouldStart = true
      }
    }
    if (!shouldStart) return

    client.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(result: BillingResult) {
        val tasks = synchronized(connectionLock) {
          isConnecting = false
          connectionTasks.toList().also { connectionTasks.clear() }
        }
        if (result.responseCode == BillingClient.BillingResponseCode.OK) {
          tasks.forEach { it.onConnected(client) }
        } else {
          tasks.forEach { it.onFailure(result.responseCode) }
        }
      }

      override fun onBillingServiceDisconnected() {
        // Billing 9.1 auto service reconnection owns the retry lifecycle.
      }
    })
  }

  private fun queryProductDetails(
    client: BillingClient,
    productId: String,
    onSuccess: (ProductDetails) -> Unit,
    onFailure: (Int) -> Unit,
  ) {
    val product = QueryProductDetailsParams.Product.newBuilder()
      .setProductId(productId)
      .setProductType(BillingClient.ProductType.SUBS)
      .build()
    val params = QueryProductDetailsParams.newBuilder()
      .setProductList(listOf(product))
      .build()
    client.queryProductDetailsAsync(params) { result, queryResult ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        onFailure(result.responseCode)
        return@queryProductDetailsAsync
      }
      val details = queryResult.productDetailsList.firstOrNull { it.productId == productId }
      if (details == null) onFailure(BillingClient.BillingResponseCode.ITEM_UNAVAILABLE)
      else onSuccess(details)
    }
  }

  private fun queryOwnedPurchases(
    client: BillingClient,
    productId: String,
    onSuccess: (List<Purchase>) -> Unit,
    onFailure: (Int) -> Unit,
  ) {
    val params = QueryPurchasesParams.newBuilder()
      .setProductType(BillingClient.ProductType.SUBS)
      .build()
    client.queryPurchasesAsync(params) { result, purchases ->
      if (result.responseCode != BillingClient.BillingResponseCode.OK) {
        onFailure(result.responseCode)
        return@queryPurchasesAsync
      }
      onSuccess(purchases.filter { productId in it.products })
    }
  }

  private fun resolveOwnedPurchase(client: BillingClient, productId: String) {
    queryOwnedPurchases(
      client,
      productId,
      onSuccess = { purchases ->
        val active = activePurchase
        val purchase = purchases.firstOrNull()
        if (active?.productId == productId && purchase != null) {
          activePurchase = null
          active.promise.resolve(purchaseMap(purchase))
        } else {
          failActivePurchase(productId, BillingClient.BillingResponseCode.ITEM_NOT_OWNED)
        }
      },
      onFailure = { code -> failActivePurchase(productId, code) },
    )
  }

  private fun resolveCancellation(productId: String) {
    val active = activePurchase ?: return
    if (active.productId != productId) return
    activePurchase = null
    active.promise.resolve(
      mapOf(
        "packageName" to packageName(),
        "productIds" to listOf(productId),
        "purchaseToken" to null,
        "state" to "cancelled",
        "acknowledged" to false,
        "autoRenewing" to false,
        "orderId" to null,
      ),
    )
  }

  private fun failActivePurchase(productId: String, responseCode: Int) {
    val active = activePurchase ?: return
    if (active.productId != productId) return
    activePurchase = null
    rejectBilling(active.promise, "purchase", responseCode)
  }

  private fun productMap(details: ProductDetails): Map<String, Any> {
    val offers = details.subscriptionOfferDetails.orEmpty().mapNotNull { offer ->
      val price = offer.pricingPhases.pricingPhaseList.lastOrNull() ?: return@mapNotNull null
      if (offer.basePlanId.isBlank() || offer.offerToken.isBlank()) return@mapNotNull null
      mapOf(
        "basePlanId" to offer.basePlanId,
        "offerId" to offer.offerId,
        "offerToken" to offer.offerToken,
        "formattedPrice" to price.formattedPrice,
        "priceAmountMicros" to price.priceAmountMicros,
        "priceCurrencyCode" to price.priceCurrencyCode,
      )
    }
    return mapOf(
      "productId" to details.productId,
      "title" to details.title,
      "description" to details.description,
      "offers" to offers,
    )
  }

  private fun purchaseMap(purchase: Purchase): Map<String, Any?> {
    val state = when (purchase.purchaseState) {
      Purchase.PurchaseState.PURCHASED -> "purchased"
      Purchase.PurchaseState.PENDING -> "pending"
      else -> "unspecified"
    }
    return mapOf(
      "packageName" to packageName(),
      "productIds" to purchase.products,
      "purchaseToken" to purchase.purchaseToken,
      "state" to state,
      "acknowledged" to purchase.isAcknowledged,
      "autoRenewing" to purchase.isAutoRenewing,
      "orderId" to purchase.orderId,
    )
  }

  private fun emitPurchaseUpdate(purchase: Purchase) {
    sendEvent("onPurchaseUpdated", purchaseMap(purchase))
  }

  private fun packageName() = appContext.reactContext?.packageName.orEmpty()

  private fun sha256(value: String): String = MessageDigest
    .getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> (byte.toInt() and 0xff).toString(16).padStart(2, '0') }

  private fun rejectBilling(promise: Promise, operation: String, responseCode: Int) {
    reject(
      promise,
      operation,
      "Google Play billing failed during $operation (code $responseCode)",
    )
  }

  private fun reject(promise: Promise, operation: String, message: String) {
    val code = "ERR_BILLING_${operation.replace('.', '_').uppercase(Locale.ROOT)}"
    promise.reject(code, message, null)
  }

  private fun destroyClient() {
    val tasks = synchronized(connectionLock) {
      isConnecting = false
      connectionTasks.toList().also { connectionTasks.clear() }
    }
    tasks.forEach { it.onFailure(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED) }
    activePurchase?.let {
      activePurchase = null
      rejectBilling(it.promise, "destroy", BillingClient.BillingResponseCode.SERVICE_DISCONNECTED)
    }
    billingClient?.endConnection()
    billingClient = null
  }
}
